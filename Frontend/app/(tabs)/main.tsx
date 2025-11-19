import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert as RNAlert,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import {
  Glasses,
  Camera,
  Play,
  Square,
  Volume2,
  Server,
  Smartphone,
  Settings,
  Clock
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';


const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const CardHeader = ({ children }) => (
  <View style={styles.cardHeader}>{children}</View>
);

const CardTitle = ({ children }) => (
  <Text style={styles.cardTitle}>{children}</Text>
);

const CardDescription = ({ children }) => (
  <Text style={styles.cardDescription}>{children}</Text>
);

const CardContent = ({ children }) => (
  <View style={styles.cardContent}>{children}</View>
);

const Button = ({ onPress, disabled, variant, children, style, size }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      styles.button,
      variant === 'outline' && styles.buttonOutline,
      variant === 'destructive' && styles.buttonDestructive,
      variant === 'secondary' && styles.buttonSecondary,
      size === 'lg' && styles.buttonLarge,
      disabled && styles.buttonDisabled,
      style,
    ]}
    activeOpacity={0.7}
  >
    {children}
  </TouchableOpacity>
);

const Badge = ({ children, variant }) => (
  <View style={[styles.badge, variant === 'default' && styles.badgeDefault]}>
    <Text style={[styles.badgeText, variant === 'default' && styles.badgeTextDefault]}>
      {children}
    </Text>
  </View>
);

const Alert = ({ children }) => (
  <View style={styles.alert}>{children}</View>
);

const AlertDescription = ({ children }) => (
  <Text style={styles.alertDescription}>{children}</Text>
);

type CameraMode = 'backend' | 'mobile' | null;
type ResponseType = 'audio' | 'text';

export default function SmartGlassesApp() {
  // Mode Selection
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);

  // Backend Settings
  const [backendUrl, setBackendUrl] = useState('http://192.168.1.67:8000');
  // const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [backendInterval, setBackendInterval] = useState(5000); // milliseconds
  const [isBackendPolling, setIsBackendPolling] = useState(false);

  // Mobile Camera
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [isMobileLive, setIsMobileLive] = useState(false);
  const [mobileInterval, setMobileInterval] = useState(5000);
  const [showCamera, setShowCamera] = useState(false);

  // Common States
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [responseType, setResponseType] = useState<ResponseType>('audio');

  // Audio
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);


  const handleAnalysisResult = async (result: any) => {
    if (!result) return;

    // El backend devuelve: { objects, hints, spoken_text }
    const text = result.spoken_text || 'Análisis recibido.';

    setLastResponse(text);

    if (responseType === 'audio') {
      // TTS local en el móvil
      try {
        Speech.stop();
        Speech.speak(text, {
          language: 'es-ES',  // o 'es-CO' si quieres
          rate: 1.0,
        });
      } catch (error) {
        console.error('Error haciendo TTS local:', error);
      }
    }
  };

  // ==================== Backend Camera Functions ====================

  const checkBackendCamera = async () => {
    try {
      const response = await fetch(`${backendUrl}/camera/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      return data.connected || false;
    } catch (error) {
      console.error('Error checking backend camera:', error);
      return false;
    }
  };

  const captureFromBackend = async () => {
    if (isCapturing) return;

    try {
      setIsCapturing(true);
      setLastResponse('Solicitando análisis al backend...');

      // Llamamos a la API de la ESP32 vía backend
      const response = await fetch(`${backendUrl}/cam/analyze`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error al analizar desde el backend (${response.status})`);
      }

      const result = await response.json();
      await handleAnalysisResult(result);

      // Si quieres mostrar imagen de la ESP32 en el futuro,
      // podemos usar /cam/frame y procesar la imagen aparte.
    } catch (error: any) {
      console.error('Error capturing from backend:', error);
      setLastResponse(`Error: ${error.message}`);
      RNAlert.alert('Error', 'No se pudo analizar desde el backend');
    } finally {
      setIsCapturing(false);
    }
  };


  const toggleBackendPolling = () => {
    setIsBackendPolling(!isBackendPolling);
    if (!isBackendPolling) {
      setLastResponse(`Modo automático activado (cada ${backendInterval / 1000}s)`);
    } else {
      setLastResponse('Modo automático desactivado');
    }
  };

  // ==================== Mobile Camera Functions ====================

  const openMobileCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        RNAlert.alert('Permisos', 'Se necesitan permisos de cámara');
        return;
      }
    }
    setShowCamera(true);
  };

  const captureFromMobile = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      setLastResponse('Capturando foto...');

      // 🔹 Capturar con base64 habilitado
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,  // ⬅️ Cambiado a true
      });

      setLastImage(photo.uri);
      setLastResponse('Enviando al servidor...');

      // 🔹 Usar el endpoint de base64 en lugar del de multipart
      const response = await fetch(`${backendUrl}/v1/analyze-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: photo.base64,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al analizar imagen (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      await handleAnalysisResult(result);
    } catch (error: any) {
      console.error('Error capturing from mobile:', error);
      setLastResponse(`Error: ${error.message}`);
      RNAlert.alert('Error', 'No se pudo procesar la imagen');
    } finally {
      setIsCapturing(false);
    }
  };


  const toggleMobileLive = () => {
    setIsMobileLive(!isMobileLive);
    if (!isMobileLive) {
      setLastResponse(`Modo automático activado (cada ${mobileInterval / 1000}s)`);
    } else {
      setLastResponse('Modo automático desactivado');
    }
  };

  // ==================== Audio Functions ====================

  const playAudioFromUrl = async (url: string) => {
    try {
      setIsPlayingAudio(true);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingAudio(false);
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlayingAudio(false);
    }
  };

  const playAudioFromBase64 = async (base64Audio: string) => {
    try {
      setIsPlayingAudio(true);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${base64Audio}` },
        { shouldPlay: true }
      );
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingAudio(false);
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlayingAudio(false);
    }
  };

  // const convertTextToAudio = async (text: string) => {
  //   try {
  //     setIsPlayingAudio(true);
  //     setLastResponse('Convirtiendo texto a audio...');

  //     // Call backend TTS endpoint
  //     const response = await fetch(`${backendUrl}/tts`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({ text }),
  //     });

  //     const result = await response.json();

  //     if (result.audio_url) {
  //       await playAudioFromUrl(result.audio_url);
  //     } else if (result.audio_base64) {
  //       await playAudioFromBase64(result.audio_base64);
  //     }

  //     setLastResponse(text);
  //   } catch (error) {
  //     console.error('Error converting text to audio:', error);
  //     setLastResponse(text); // Show text if TTS fails
  //     setIsPlayingAudio(false);
  //   }
  // };

  // ==================== Effects ====================

  // Backend polling effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBackendPolling && cameraMode === 'backend' && !isCapturing) {
      interval = setInterval(() => {
        captureFromBackend();
      }, backendInterval);
    }
    return () => clearInterval(interval);
  }, [isBackendPolling, cameraMode, isCapturing, backendInterval]);

  // Mobile live mode effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isMobileLive && cameraMode === 'mobile' && !isCapturing) {
      interval = setInterval(() => {
        captureFromMobile();
      }, mobileInterval);
    }
    return () => clearInterval(interval);
  }, [isMobileLive, cameraMode, isCapturing, mobileInterval]);

  // Cleanup audio
  useEffect(() => {
    return sound
      ? () => {
        sound.unloadAsync();
      }
      : undefined;
  }, [sound]);

  // ==================== Render ====================

  if (!cameraMode) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Glasses size={64} color="#3b82f6" />
            </View>
            <Text style={styles.title}>Virtual Eyes</Text>
            <Text style={styles.subtitle}>Selecciona el modo de cámara</Text>
          </View>

          <Card>
            <CardHeader>
              <CardTitle>Modo de Operación</CardTitle>
              <CardDescription>Elige cómo deseas capturar las imágenes</CardDescription>
            </CardHeader>
            <CardContent>
              <View style={styles.modeGrid}>
                <TouchableOpacity
                  style={styles.modeCard}
                  onPress={() => setCameraMode('backend')}
                >
                  <Server size={48} color="#3b82f6" />
                  <Text style={styles.modeTitle}>Cámara Backend</Text>
                  <Text style={styles.modeDescription}>
                    ESP32-CAM conectada al servidor
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modeCard}
                  onPress={() => {
                    setCameraMode('mobile');
                    openMobileCamera();
                  }}
                >
                  <Smartphone size={48} color="#10b981" />
                  <Text style={styles.modeTitle}>Cámara Móvil</Text>
                  <Text style={styles.modeDescription}>
                    Usar la cámara del dispositivo
                  </Text>
                </TouchableOpacity>
              </View>
            </CardContent>
          </Card>

          <Button onPress={() => setShowSettings(true)} variant="outline">
            <View style={styles.buttonContent}>
              <Settings size={20} color="#374151" />
              <Text style={styles.buttonTextOutline}>Configuración</Text>
            </View>
          </Button>
        </ScrollView>

        <SettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          backendUrl={backendUrl}
          setBackendUrl={setBackendUrl}
          backendInterval={backendInterval}
          setBackendInterval={setBackendInterval}
          mobileInterval={mobileInterval}
          setMobileInterval={setMobileInterval}
          responseType={responseType}
          setResponseType={setResponseType}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerSmall}>
          <Glasses size={32} color="#3b82f6" />
          <View style={styles.headerTextContainer}>
            <Text style={styles.titleSmall}>Virtual Eyes</Text>
            <Badge variant="default">
              {cameraMode === 'backend' ? 'Backend' : 'Móvil'}
            </Badge>
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <Settings size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Camera Preview for Mobile Mode */}
        {cameraMode === 'mobile' && showCamera && (
          <Card>
            <CardHeader>
              <View style={styles.titleWithIcon}>
                <Camera size={20} color="#374151" />
                <Text style={styles.cardTitle}>Vista Previa</Text>
              </View>
            </CardHeader>
            <CardContent>
              <View style={styles.cameraContainer}>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="back"
                />
              </View>
            </CardContent>
          </Card>
        )}

        {/* Last Captured Image */}
        {lastImage && (
          <Card>
            <CardHeader>
              <View style={styles.titleWithIcon}>
                <Camera size={20} color="#374151" />
                <Text style={styles.cardTitle}>Última Captura</Text>
              </View>
            </CardHeader>
            <CardContent>
              <Image
                source={{ uri: lastImage }}
                style={styles.capturedImage}
                resizeMode="contain"
              />
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <Card>
          <CardHeader>
            <View style={styles.titleWithIcon}>
              <Camera size={20} color="#374151" />
              <Text style={styles.cardTitle}>Controles</Text>
            </View>
            <CardDescription>
              {cameraMode === 'backend'
                ? 'Controla la cámara del servidor'
                : 'Captura fotos con tu dispositivo'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <View style={styles.buttonGrid}>
              <Button
                onPress={
                  cameraMode === 'backend'
                    ? captureFromBackend
                    : captureFromMobile
                }
                disabled={isCapturing || (cameraMode === 'backend' ? isBackendPolling : isMobileLive)}
                size="lg"
                style={styles.gridButton}
              >
                <View style={styles.buttonColumnContent}>
                  {isCapturing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Camera size={24} color="white" />
                  )}
                  <Text style={styles.buttonText}>
                    {isCapturing ? 'Capturando...' : 'Capturar'}
                  </Text>
                </View>
              </Button>

              <Button
                onPress={
                  cameraMode === 'backend'
                    ? toggleBackendPolling
                    : toggleMobileLive
                }
                variant={
                  (cameraMode === 'backend' ? isBackendPolling : isMobileLive)
                    ? 'destructive'
                    : 'default'
                }
                size="lg"
                style={styles.gridButton}
              >
                <View style={styles.buttonColumnContent}>
                  {(cameraMode === 'backend' ? isBackendPolling : isMobileLive) ? (
                    <Square size={24} color="white" />
                  ) : (
                    <Play size={24} color="white" />
                  )}
                  <Text style={styles.buttonText}>
                    {(cameraMode === 'backend' ? isBackendPolling : isMobileLive)
                      ? 'Detener'
                      : 'Auto'}
                  </Text>
                </View>
              </Button>
            </View>

            <Button
              onPress={() => {
                setCameraMode(null);
                setShowCamera(false);
                setIsBackendPolling(false);
                setIsMobileLive(false);
              }}
              variant="outline"
              style={styles.backButton}
            >
              <Text style={styles.buttonTextOutline}>Cambiar Modo</Text>
            </Button>
          </CardContent>
        </Card>

        {/* Status */}
        {lastResponse && (
          <Card>
            <CardHeader>
              <View style={styles.titleWithIcon}>
                <Volume2 size={20} color="#374151" />
                <Text style={styles.cardTitle}>Estado</Text>
                {isPlayingAudio && (
                  <ActivityIndicator size="small" color="#3b82f6" />
                )}
              </View>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>{lastResponse}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </ScrollView>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        backendUrl={backendUrl}
        setBackendUrl={setBackendUrl}
        backendInterval={backendInterval}
        setBackendInterval={setBackendInterval}
        mobileInterval={mobileInterval}
        setMobileInterval={setMobileInterval}
        responseType={responseType}
        setResponseType={setResponseType}
      />
    </View>
  );
}

// ==================== Settings Modal Component ====================

function SettingsModal({
  visible,
  onClose,
  backendUrl,
  setBackendUrl,
  backendInterval,
  setBackendInterval,
  mobileInterval,
  setMobileInterval,
  responseType,
  setResponseType,
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configuración</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Backend URL */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>URL del Backend</Text>
              <TextInput
                style={styles.input}
                value={backendUrl}
                onChangeText={setBackendUrl}
                placeholder="https://tu-backend.com"
                autoCapitalize="none"
              />
            </View>

            {/* Backend Interval */}
            <View style={styles.settingSection}>
              <View style={styles.settingLabelRow}>
                <Clock size={16} color="#6b7280" />
                <Text style={styles.settingLabel}>
                  Intervalo Backend (segundos)
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={String(backendInterval / 1000)}
                onChangeText={(text) =>
                  setBackendInterval(Number(text) * 1000 || 5000)
                }
                keyboardType="numeric"
                placeholder="5"
              />
            </View>

            {/* Mobile Interval */}
            <View style={styles.settingSection}>
              <View style={styles.settingLabelRow}>
                <Clock size={16} color="#6b7280" />
                <Text style={styles.settingLabel}>
                  Intervalo Móvil (segundos)
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={String(mobileInterval / 1000)}
                onChangeText={(text) =>
                  setMobileInterval(Number(text) * 1000 || 5000)
                }
                keyboardType="numeric"
                placeholder="5"
              />
            </View>

            {/* Response Type */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Tipo de Respuesta</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setResponseType('audio')}
                >
                  <View
                    style={[
                      styles.radio,
                      responseType === 'audio' && styles.radioSelected,
                    ]}
                  />
                  <Text style={styles.radioLabel}>Audio (con TTS)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setResponseType('text')}
                >
                  <View
                    style={[
                      styles.radio,
                      responseType === 'text' && styles.radioSelected,
                    ]}
                  />
                  <Text style={styles.radioLabel}>Solo Texto</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Button onPress={onClose} style={styles.saveButton}>
              <Text style={styles.buttonText}>Guardar</Text>
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  headerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginBottom: 16,
  },
  headerTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  titleSmall: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  cardContent: {
    padding: 20,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeGrid: {
    gap: 16,
  },
  modeCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
  },
  modeDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonSecondary: {
    backgroundColor: '#6b7280',
  },
  buttonDestructive: {
    backgroundColor: '#dc2626',
  },
  buttonLarge: {
    paddingVertical: 20,
    minHeight: 80,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonColumnContent: {
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonTextOutline: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  gridButton: {
    flex: 1,
  },
  backButton: {
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeDefault: {
    backgroundColor: '#3b82f6',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  badgeTextDefault: {
    color: 'white',
  },
  alert: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  alertDescription: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  cameraContainer: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  capturedImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalClose: {
    fontSize: 28,
    color: '#6b7280',
  },
  settingSection: {
    marginBottom: 24,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  radioSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 16,
    color: '#374151',
  },
  saveButton: {
    marginTop: 8,
  },
});
