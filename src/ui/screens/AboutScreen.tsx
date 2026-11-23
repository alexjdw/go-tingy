import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { NOTICES } from '../../data/notices';
import { Btn, theme } from '../components/theme';

/** About: the version, the license, and the open-source notices the app's libraries ask to travel with it. */
export function AboutScreen({ onBack }: { onBack: () => void }) {
  const version = Constants.expoConfig?.version ?? '';
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.top}>
        <Btn label="‹ Back" kind="ghost" onPress={onBack} />
        <Text style={styles.h1}>About</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Go Flashcards{version ? ` ${version}` : ''}</Text>
        <Text style={styles.text}>
          Your puzzles and progress stay on this device. The app has no account, ads or tracking.
        </Text>
      </View>
      <Text style={styles.h2}>Open-source licenses</Text>
      <View style={styles.card}>
        <Text style={styles.notices} selectable>
          {NOTICES}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { color: theme.text, fontSize: 22, fontWeight: '800' },
  h2: { color: theme.text, fontSize: 17, fontWeight: '700' },
  card: { backgroundColor: theme.card, borderRadius: 10, padding: 14, gap: 8 },
  title: { color: theme.text, fontSize: 16, fontWeight: '700' },
  text: { color: theme.muted, fontSize: 14 },
  notices: { color: theme.muted, fontSize: 12 },
});
