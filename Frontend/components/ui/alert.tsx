import * as React from "react";
import { View, Text, StyleSheet } from "react-native";

export function Alert({ children }: { children: React.ReactNode }) {
  return <View style={styles.alert}>{children}</View>;
}

export function AlertDescription({ children }: { children: React.ReactNode }) {
  return <Text style={styles.description}>{children}</Text>;
}

const styles = StyleSheet.create({
  alert: {
    backgroundColor: "#fef3c7",
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  description: {
    fontSize: 14,
    color: "#92400e",
  },
});
