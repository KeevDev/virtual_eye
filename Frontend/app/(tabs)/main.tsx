import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert as RNAlert,
} from 'react-native';
import { Glasses, Wifi, WifiOff, Camera, Play, Square, Volume2 } from 'lucide-react-native';

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

export default function SmartGlassesApp() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [lastDescription, setLastDescription] = useState('');

  const handleConnect = async () => {
    setIsConnecting(true);
    // Simulate connection delay
    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
    }, 2000);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsLiveMode(false);
    setIsDescribing(false);
  };

  const handleDescribeNow = async () => {
    if (!isConnected) return;

    setIsDescribing(true);
    // Simulate processing time
    setTimeout(() => {
      const descriptions = [
        'Veo una mesa de madera con una taza de café y un libro abierto',
        'Hay una persona sentada frente a una computadora portátil',
        'Observo una ventana con luz natural y plantas en el alféizar',
        'Detecto un teléfono móvil y unos auriculares sobre la mesa',
      ];
      const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
      setLastDescription(randomDescription);
      setIsDescribing(false);
    }, 3000);
  };

  const handleLiveMode = () => {
    if (!isConnected) return;

    setIsLiveMode(!isLiveMode);
    if (!isLiveMode) {
      setLastDescription('Modo en vivo activado - describiendo cada 5 segundos');
    } else {
      setLastDescription('Modo en vivo desactivado');
    }
  };

  useEffect(() => {
    let interval;
    if (isLiveMode && isConnected) {
      interval = setInterval(() => {
        const liveDescriptions = [
          'Modo vivo: Persona caminando hacia la derecha',
          'Modo vivo: Obstáculo detectado a 2 metros',
          'Modo vivo: Texto visible - "Salida de emergencia"',
          'Modo vivo: Escalones detectados hacia abajo',
        ];
        const randomDesc = liveDescriptions[Math.floor(Math.random() * liveDescriptions.length)];
        setLastDescription(randomDesc);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isLiveMode, isConnected]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Glasses size={64} color="#2563eb" />
          </View>
          <Text style={styles.title}>Virtual Eyes</Text>
          <Text style={styles.subtitle}>Descripción del entorno en tiempo real</Text>
        </View>

        {/* Connection Status Card */}
        <Card>
          <CardHeader>
            <View style={styles.titleRow}>
              <View style={styles.titleWithIcon}>
                {isConnected ? (
                  <Wifi size={20} color="#16a34a" />
                ) : (
                  <WifiOff size={20} color="#dc2626" />
                )}
                <Text style={styles.cardTitle}>Estado de conexión</Text>
              </View>
              <Badge variant={isConnected ? 'default' : 'secondary'}>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </Badge>
            </View>
            <CardDescription>
              {isConnected
                ? 'Las gafas están conectadas y listas para usar'
                : 'Conecta tus gafas inteligentes para comenzar'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isConnected ? (
              <Button onPress={handleConnect} disabled={isConnecting}>
                <View style={styles.buttonContent}>
                  {isConnecting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Wifi size={16} color="white" />
                  )}
                  <Text style={styles.buttonText}>
                    {isConnecting ? 'Conectando...' : 'Conectar gafas'}
                  </Text>
                </View>
              </Button>
            ) : (
              <Button variant="outline" onPress={handleDisconnect}>
                <View style={styles.buttonContent}>
                  <WifiOff size={16} color="#374151" />
                  <Text style={styles.buttonTextOutline}>Desconectar</Text>
                </View>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Main Controls */}
        {isConnected && (
          <Card>
            <CardHeader>
              <View style={styles.titleWithIcon}>
                <Camera size={20} color="#374151" />
                <Text style={styles.cardTitle}>Controles principales</Text>
              </View>
              <CardDescription>Prueba las funciones de descripción</CardDescription>
            </CardHeader>
            <CardContent>
              <View style={styles.buttonGrid}>
                <Button
                  onPress={handleDescribeNow}
                  disabled={isDescribing || isLiveMode}
                  size="lg"
                  style={styles.gridButton}
                >
                  <View style={styles.buttonColumnContent}>
                    <Camera size={24} color="white" />
                    <Text style={styles.buttonText}>
                      {isDescribing ? 'Describiendo...' : 'Describir ahora'}
                    </Text>
                  </View>
                </Button>

                <Button
                  onPress={handleLiveMode}
                  variant={isLiveMode ? 'destructive' : 'default'}
                  size="lg"
                  style={styles.gridButton}
                >
                  <View style={styles.buttonColumnContent}>
                    {isLiveMode ? (
                      <Square size={24} color="white" />
                    ) : (
                      <Play size={24} color="white" />
                    )}
                    <Text style={styles.buttonText}>
                      {isLiveMode ? 'Detener modo vivo' : 'Modo en vivo'}
                    </Text>
                  </View>
                </Button>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Last Description */}
        {lastDescription && (
          <Card>
            <CardHeader>
              <View style={styles.titleWithIcon}>
                <Volume2 size={20} color="#374151" />
                <Text style={styles.cardTitle}>Última descripción</Text>
              </View>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>{lastDescription}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Connection Alert */}
        {!isConnected && (
          <Alert>
            <View style={styles.alertWithIcon}>
              <Glasses size={16} color="#374151" />
              <Text style={styles.alertDescription}>
                Para usar las funciones de descripción, primero conecta tus gafas inteligentes.
              </Text>
            </View>
          </Alert>
        )}
      </View>
    </ScrollView>
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
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  cardContent: {
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  gridButton: {
    flex: 1,
  },
  badge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeDefault: {
    backgroundColor: '#16a34a',
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
  alertWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});