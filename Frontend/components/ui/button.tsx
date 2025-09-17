import * as React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

export function Button({
  children,
  onPress,
  variant = "default",
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "default" | "outline";
}) {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === "outline" ? styles.outline : styles.default,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.text,
          variant === "outline" ? styles.textOutline : styles.textDefault,
        ]}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 4,
  },
  default: {
    backgroundColor: "#6366f1",
  },
  outline: {
    borderWidth: 1,
    borderColor: "#6366f1",
    backgroundColor: "transparent",
  },
  text: { fontWeight: "600" },
  textDefault: { color: "#fff" },
  textOutline: { color: "#6366f1" },
});
