import { useMemo, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { Problem } from '../../data/samples';
import {
  type Crop,
  type CropSide,
  type Game,
  checkCrop,
  extractPuzzle,
  fitCrop,
  fullCrop,
  cropDims,
  loadGame,
  moveSide,
} from '../../sgf/fromGame';
import { readPickedFile } from '../../sgf/importer';
import { coordName } from '../../sgf/parser';
import { fullViewport } from '../../go/viewport';
import { BoardView } from '../components/Board';
import { Btn, theme } from '../components/theme';

type Step = 'game' | 'moves' | 'area';
const TITLES: Record<Step, string> = { game: 'Choose a game', moves: 'Choose the moves', area: 'Choose the area' };
const STEPS: Step[] = ['game', 'moves', 'area'];
const noop = () => {};

interface Props {
  onCancel: () => void;
  onSave: (p: Problem) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const who = (c: 'B' | 'W') => (c === 'B' ? 'Black' : 'White');

/** New puzzle from a game: load an SGF game, pick the first and last move, then pick the part of the board to keep. */
export function FromGame({ onCancel, onSave }: Props) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 24, 560);

  const [step, setStep] = useState<Step>('game');
  const [game, setGame] = useState<Game | null>(null);
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState('');
  // the position shown on the "moves" step, and the chosen range: moves start+1 ..= end
  const [cursor, setCursor] = useState(1);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [crop, setCrop] = useState<Crop>({ x0: 0, y0: 0, x1: 18, y1: 18 });
  const [showEnd, setShowEnd] = useState(true);
  const [titleText, setTitleText] = useState<string | null>(null);

  const total = game?.moves.length ?? 0;

  const open = (text: string, source: string) => {
    const r = loadGame(text);
    if ('error' in r) return setNotice(r.error);
    const g = r.game;
    const last = Math.min(g.moves.length, 6);
    setGame(g);
    setCursor(1);
    setStart(0);
    setEnd(last);
    setCrop(fitCrop(g, 0, last));
    setTitleText(null);
    setNotice(g.gamesInFile > 1 ? `${source} holds ${g.gamesInFile} games. Using the first one.` : '');
    setStep('moves');
  };

  const pickFile = async () => {
    setNotice('');
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: '*/*' });
      if (res.canceled) return;
      const a = res.assets[0];
      const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      const items = readPickedFile(a.name, bytes); // unpacks .gz/.zip, decodes text
      if (!items.length) return setNotice(`Nothing to read in ${a.name}.`);
      open(items[0].text, a.name);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const range = `moves ${start + 1}–${end}`;
  const title = titleText ?? (game ? `${game.name} · ${range}` : '');
  const check = useMemo(() => (game ? checkCrop(game, start, end, crop) : null), [game, start, end, crop]);
  const made = useMemo(
    () => (game && step === 'area' ? extractPuzzle(game, { start, end, crop, title }) : null),
    [game, step, start, end, crop, title],
  );

  const setFirst = (k: number) => {
    setStart(k - 1);
    if (end < k) setEnd(k);
  };
  const setLast = (k: number) => {
    setEnd(k);
    if (start >= k) setStart(k - 1);
  };

  const toArea = () => {
    if (!game) return;
    setCrop(fitCrop(game, start, end));
    setShowEnd(true);
    setStep('area');
  };

  const stepIdx = STEPS.indexOf(step);
  const move = game && cursor >= 1 ? game.moves[cursor - 1] : null;

  let boardNode = null;
  if (game && step === 'moves') {
    boardNode = (
      <BoardView
        board={game.boards[cursor]}
        view={fullViewport(game.dims)}
        width={boardW}
        last={move?.point ?? null}
        hints={[]}
        markup={[]}
        onPlay={noop}
        disabled
      />
    );
  } else if (game && step === 'area') {
    const at = showEnd ? end : start;
    boardNode = (
      <BoardView
        board={game.boards[at]}
        view={crop}
        width={boardW}
        last={showEnd ? (game.moves[end - 1].point ?? null) : null}
        hints={[]}
        markup={[]}
        onPlay={noop}
        disabled
      />
    );
  }

  const size = cropDims(crop);
  const blocked = !made || made.validation.errors.length > 0 || !!check?.outside.length || check?.differs != null;

  const save = () => {
    if (!made || blocked) return;
    onSave({ id: `c-${Date.now()}`, title: title.trim() || 'Untitled', sgf: made.sgf });
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Btn label="‹ Cancel" kind="ghost" onPress={onCancel} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>New from game</Text>
          <Text style={styles.sub}>
            Step {stepIdx + 1}/3 · {TITLES[step]}
          </Text>
        </View>
      </View>

      {boardNode ? <View style={styles.boardBox}>{boardNode}</View> : null}

      {step === 'game' && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Pick a game (.sgf, .sgf.gz or .zip), or paste its SGF text. You then choose the moves and the part of the
            board to turn into a puzzle.
          </Text>
          <Btn label="Choose a game file…" onPress={pickFile} />
          <TextInput
            value={paste}
            onChangeText={setPaste}
            placeholder="…or paste SGF text here"
            placeholderTextColor={theme.muted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
          />
          <Btn label="Use pasted game" kind="ghost" disabled={!paste.trim()} onPress={() => open(paste, 'The text')} />
          {notice ? <Text style={styles.warn}>{notice}</Text> : null}
        </View>
      )}

      {step === 'moves' && game && (
        <View style={styles.panel}>
          <Text style={styles.big}>
            Move {cursor} of {total}
            {move ? ` · ${who(move.color)} ${move.point ? coordName(move.point, game.dims) : 'passes'}` : ''}
          </Text>
          <Scrubber total={total} value={cursor} first={start + 1} last={end} onChange={setCursor} />
          <View style={styles.row}>
            <Btn
              label="‹‹"
              kind="ghost"
              accessibilityLabel="Back 10 moves"
              onPress={() => setCursor(clamp(cursor - 10, 1, total))}
            />
            <Btn
              label="‹"
              kind="ghost"
              accessibilityLabel="Back one move"
              onPress={() => setCursor(clamp(cursor - 1, 1, total))}
            />
            <Btn
              label="›"
              kind="ghost"
              accessibilityLabel="Forward one move"
              onPress={() => setCursor(clamp(cursor + 1, 1, total))}
            />
            <Btn
              label="››"
              kind="ghost"
              accessibilityLabel="Forward 10 moves"
              onPress={() => setCursor(clamp(cursor + 10, 1, total))}
            />
          </View>
          <View style={styles.row}>
            <Btn label="First move here" onPress={() => setFirst(cursor)} />
            <Btn label="Last move here" onPress={() => setLast(cursor)} />
          </View>
          <Text style={styles.hint}>
            The puzzle starts with the board as it is just before move {start + 1}, and its solution is {range} (
            {end - start} move{end - start === 1 ? '' : 's'}).
          </Text>
          <View style={styles.row}>
            <Btn label="‹ Back" kind="ghost" onPress={() => setStep('game')} />
            <Btn label="Next ›" onPress={toArea} />
          </View>
        </View>
      )}

      {step === 'area' && game && (
        <View style={styles.panel}>
          <View style={styles.row}>
            <Btn label="Start position" kind={showEnd ? 'ghost' : 'solid'} onPress={() => setShowEnd(false)} />
            <Btn label="After the last move" kind={showEnd ? 'solid' : 'ghost'} onPress={() => setShowEnd(true)} />
          </View>
          <Text style={styles.big}>
            Area: {size.cols}×{size.rows}
          </Text>
          <Text style={styles.hint}>Move each side out (+) or in (−) to cut away what you do not need.</Text>
          {(['top', 'bottom', 'left', 'right'] as CropSide[]).map((side) => (
            <View key={side} style={styles.row}>
              <Text style={[styles.hint, styles.sideName]}>{side[0].toUpperCase() + side.slice(1)}</Text>
              <Btn
                label="−"
                kind="ghost"
                accessibilityLabel={`Move ${side} side in`}
                onPress={() => setCrop(moveSide(crop, side, -1, game.dims))}
              />
              <Btn
                label="+"
                kind="ghost"
                accessibilityLabel={`Move ${side} side out`}
                onPress={() => setCrop(moveSide(crop, side, 1, game.dims))}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Btn label="Fit to the moves" kind="ghost" onPress={() => setCrop(fitCrop(game, start, end))} />
            <Btn label="Whole board" kind="ghost" onPress={() => setCrop(fullCrop(game.dims))} />
          </View>

          {check?.outside.length ? (
            <Text style={styles.warn}>
              {check.outside.length === 1 ? 'Move' : 'Moves'} {check.outside.slice(0, 6).join(', ')}
              {check.outside.length > 6 ? '…' : ''} {check.outside.length === 1 ? 'is' : 'are'} outside this area. Make
              the area bigger, or go back and choose other moves.
            </Text>
          ) : check?.differs != null ? (
            <Text style={styles.warn}>
              With this area, move {check.differs} does not play out as in the game, because the cut edge is treated as
              the edge of the board. Make the area bigger on that side.
            </Text>
          ) : null}
          {made?.validation.errors.map((e) => (
            <Text key={e} style={styles.warn}>
              {e}
            </Text>
          ))}

          <TextInput
            value={title}
            onChangeText={setTitleText}
            placeholder="Title"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          <Btn label="Save puzzle" onPress={save} disabled={blocked} />
          <View style={styles.row}>
            <Btn label="‹ Back" kind="ghost" onPress={() => setStep('moves')} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/** A bar you drag or tap to pick a move; the chosen range of moves is shaded. */
function Scrubber({
  total,
  value,
  first,
  last,
  onChange,
}: {
  total: number;
  value: number;
  first: number;
  last: number;
  onChange: (n: number) => void;
}) {
  const [w, setW] = useState(0);
  const at = (e: GestureResponderEvent) => {
    if (w <= 0) return;
    onChange(clamp(Math.round((e.nativeEvent.locationX / w) * (total - 1)) + 1, 1, total));
  };
  const frac = (n: number) => (total > 1 ? (n - 1) / (total - 1) : 0);
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Move"
      accessibilityValue={{ min: 1, max: total, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1), 1, total))
      }
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={at}
      onResponderMove={at}
      style={styles.track}
    >
      <View
        pointerEvents="none"
        style={[styles.range, { left: frac(first) * w, width: Math.max(4, (frac(last) - frac(first)) * w) }]}
      />
      <View pointerEvents="none" style={[styles.thumb, { left: clamp(frac(value) * w - 7, 0, Math.max(0, w - 14)) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 560 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  boardBox: { borderRadius: 8 },
  panel: { width: '100%', maxWidth: 560, gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  hint: { color: theme.muted, fontSize: 14 },
  big: { color: theme.text, fontSize: 16, fontWeight: '700' },
  warn: { color: '#e5a03d', fontSize: 14 },
  sideName: { width: 64 },
  input: { backgroundColor: theme.card, color: theme.text, borderRadius: 8, padding: 12, fontSize: 15 },
  track: { height: 36, borderRadius: 18, backgroundColor: theme.card, justifyContent: 'center', overflow: 'hidden' },
  range: { position: 'absolute', top: 10, height: 16, borderRadius: 8, backgroundColor: theme.accent, opacity: 0.45 },
  thumb: { position: 'absolute', top: 6, width: 14, height: 24, borderRadius: 7, backgroundColor: theme.text },
});
