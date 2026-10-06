import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://girdle-monkhood-compacter.ngrok-free.dev';

type Lead = {
  id: string;
  created_time?: string;
  full_name?: string;
  email?: string;
  phone_number?: string;
  city?: string;
};

export default function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
const socket = io(SERVER_URL, {
  transports: ['polling', 'websocket'],
  extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
});


   
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('leads:init', (data: Lead[]) => setLeads(data));
    socket.on('lead:new', (lead: Lead) =>
      setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]))
    );
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meta Leads</Text>
        <Text style={{ color: connected ? '#16a34a' : '#dc2626' }}>
          {connected ? '● Live' : '● Offline'}
        </Text>
      </View>
      <FlatList
        data={leads}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={styles.empty}>Waiting for leads...</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.full_name || 'Unknown'}</Text>
            <Text>{item.email}</Text>
            <Text>{item.phone_number}</Text>
            <Text>{item.city}</Text>
            <Text style={styles.time}>{item.created_time}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { padding: 16, marginHorizontal: 12, marginVertical: 6, borderRadius: 10, backgroundColor: '#f2f4f7' },
  name: { fontWeight: '700', fontSize: 16, marginBottom: 4 },
  time: { color: '#6b7280', marginTop: 4, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: '#6b7280'},
});