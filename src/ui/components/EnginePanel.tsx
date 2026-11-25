import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { KataGoStatus } from '../../analysis/bridge';
import { type Color, type Dims, coordName } from '../../sgf/parser';
import type { EngineState } from '../engine';
import { KataGoSetup } from './KataGoSetup';
import { Btn, theme } from './theme';

interface Props {
  /** is there an engine in this app at all (the desktop app)? */
  available: boolean;
  status: KataGoStatus | null;
  state: EngineState;
  toMove: Color;
  dims: Dims;
  onAsk: (maxVisits: number) => void;
  /** ask the app again whether KataGo is set up, and open the folder it goes in */
  onRecheck: () => void;
  onOpenFolder: () => void;
}

const QUICK = 400;
const DEEP = 3000;

/** What KataGo thinks of the position on the board: its favorite moves, numbered the same as on the board. */
export function EnginePanel({ available, status, state, toMove, dims, onAsk, onRecheck, onOpenFolder }: Props) {
  const [help, setHelp] = useState(false);
  if (!available) {
    return <Text style={styles.hint}>KataGo second opinions are available in the desktop app.</Text>;
  }
  if (status && !status.ready) {
    return <KataGoSetup status={status} onCheckAgain={onRecheck} onOpenFolder={onOpenFolder} />;
  }
  const busy = state.kind === 'busy';
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Btn label={busy ? 'Thinking…' : 'Ask KataGo'} disabled={busy || !status} onPress={() => onAsk(QUICK)} />
        <Btn label="Think longer" kind="ghost" disabled={busy || !status} onPress={() => onAsk(DEEP)} />
      </View>
      {state.kind === 'error' ? (
        <>
          <Text style={styles.error}>{state.message}</Text>
          <Btn label={help ? 'Hide setup help' : 'Setup help'} kind="ghost" onPress={() => setHelp((v) => !v)} />
          {help && status ? (
            <KataGoSetup status={status} problem={state.message} onCheckAgain={onRecheck} onOpenFolder={onOpenFolder} />
          ) : null}
        </>
      ) : null}
      {state.kind === 'done' && state.moves.length === 0 ? (
        <Text style={styles.hint}>KataGo has no suggestion here.</Text>
      ) : null}
      {state.kind === 'done'
        ? state.moves.map((m, i) => (
            <Text key={i} style={styles.line} accessibilityLabel={`Suggestion ${i + 1}`}>
              <Text style={styles.rank}>{i + 1}</Text>
              {'  '}
              {m.point ? coordName(m.point, dims) : 'pass'}
              {'   '}
              {Math.round(m.winrate * 100)}% for {toMove === 'B' ? 'Black' : 'White'}
              {'   '}
              {m.scoreLead >= 0 ? '+' : '−'}
              {Math.abs(m.scoreLead).toFixed(1)}
              {m.line.length > 1
                ? `\n    then ${m.line
                    .slice(1, 6)
                    .map((p) => coordName(p, dims))
                    .join(' ')}`
                : ''}
            </Text>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  hint: { color: theme.muted, fontSize: 14 },
  error: { color: '#e5484d', fontSize: 14 },
  line: { color: theme.text, fontSize: 14 },
  rank: { color: theme.accent, fontWeight: '700' },
});
