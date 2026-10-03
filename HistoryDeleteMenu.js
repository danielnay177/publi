import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

export default function HistoryDeleteMenu({ item, busy, onClose, onDelete }) {
  return <Modal transparent visible={!!item} animationType="fade" onRequestClose={onClose}>
    <Pressable accessible={false} style={s.backdrop} onPress={busy ? undefined : onClose}>
      <View style={s.content}>
        <View style={s.preview}><Text numberOfLines={2} style={s.title}>{item?.title || 'Saved conversation'}</Text></View>
        <Pressable style={s.glass} accessibilityRole="button" accessibilityLabel="Delete selected history" disabled={busy} onPress={(event) => { event.stopPropagation(); onDelete?.(); }}>
          <BlurView intensity={85} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={s.shine} />
          {busy ? <ActivityIndicator color="#D83434" /> : <Ionicons name="trash-outline" size={27} color="#D83434" />}
          <Text style={s.deleteText}>{busy ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </Pressable>
  </Modal>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.38)', justifyContent: 'center', padding: 28 },
  content: { gap: 16 },
  preview: { borderRadius: 22, padding: 22, backgroundColor: 'rgba(34,41,39,.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,.35)' },
  title: { color: '#FFF', fontSize: 19, fontWeight: '600' },
  glass: { overflow: 'hidden', borderRadius: 38, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.85)', backgroundColor: 'rgba(245,248,255,.7)', paddingVertical: 21, paddingHorizontal: 28, flexDirection: 'row', gap: 16, alignItems: 'center' },
  shine: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,.2)' },
  deleteText: { color: '#D83434', fontSize: 25, fontWeight: '500' },
});
