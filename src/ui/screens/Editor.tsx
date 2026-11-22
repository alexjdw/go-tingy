import { useMemo, useReducer, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { Problem } from '../../data/samples';
import { Board } from '../../go/board';
import {
  Color,
  Point,
  SgfNode,
  boardSize,
  coordName,
  firstMoveColor,
  nodeMove,
  parseSgf,
  pointList,
  pointToSgf,
  toSgf,
} from '../../sgf/parser';
import { BoardView, Viewport } from '../components/Board';
import { Btn, theme } from '../components/theme';
import { useZoom, zoomedTap } from '../zoom';

type Step = 'size' | 'black' | 'white' | 'tree';
type Tool = 'move' | 'label';
type Mark = 'correct' | 'incorrect' | 'neutral';

const STEPS: Step[] = ['size', 'black', 'white', 'tree'];
const TITLES: Record<Step, string> = {
  size: 'Board size',
  black: 'Black starting stones',
  white: 'White starting stones',
  tree: 'Move tree',
};
const other = (c: Color): Color => (c === 'B' ? 'W' : 'B');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const markOf = (n: SgfNode): Mark => (n.props.TE ? 'correct' : n.props.BM ? 'incorrect' : 'neutral');

interface Props {
  initial?: Problem;
  onCancel: () => void;
  onSave: (p: Problem) => void;
}

export function Editor({ initial, onCancel, onSave }: Props) {
  const { width } = useWindowDimensions();
  const boardW = Math.min(width - 24, 560);

  const init = useMemo(() => {
    if (!initial) return null;
    const root = parseSgf(initial.sgf);
    const size = boardSize(root);
    const black = pointList(root.props.AB, size);
    const white = pointList(root.props.AW, size);
    const first = firstMoveColor(root);
    delete root.props.AB;
    delete root.props.AW;
    return { root, size, black, white, first };
  }, [initial]);

  const [, force] = useReducer((n: number) => n + 1, 0);
  const [step, setStep] = useState<Step>(init ? 'tree' : 'size');
  const [size, setSize] = useState(init?.size ?? 19);
  const [customSize, setCustomSize] = useState('');
  const [black, setBlack] = useState<Point[]>(init?.black ?? []);
  const [white, setWhite] = useState<Point[]>(init?.white ?? []);
  const [root] = useState<SgfNode>(() => init?.root ?? { props: {}, children: [], parent: null });
  const [cursor, setCursor] = useState<SgfNode>(root);
  const [first, setFirst] = useState<Color>(init?.first ?? 'B');
  const [swap, setSwap] = useState(false);
  const [tool, setTool] = useState<Tool>('move');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [error, setError] = useState('');

  const base: Viewport = useMemo(() => ({ x0: 0, x1: size - 1, y0: 0, y1: size - 1 }), [size]);
  const zoom = useZoom(base);

  // Board at the cursor: setup stones, then every move on the path from the root.
  const path: SgfNode[] = [];
  for (let n: SgfNode | null = cursor; n && n !== root; n = n.parent) path.unshift(n);
  let board = new Board(size);
  for (const p of black) board = board.withStone(p, 'B');
  for (const p of white) board = board.withStone(p, 'W');
  if (step === 'tree') {
    for (const n of path) {
      const m = nodeMove(n, size);
      if (m) board = board.play(m.point, m.color)?.board ?? board;
    }
  }
  const lastMove = cursor !== root ? nodeMove(cursor, size)?.point ?? null : null;

  const lastColor = cursor !== root ? nodeMove(cursor, size)?.color : undefined;
  const natural: Color = lastColor ? other(lastColor) : first;
  const nextColor: Color = swap ? other(natural) : natural;

  const labels = (cursor.props.LB ?? []).map((v) => {
    const [pt, label] = v.split(':');
    return { point: pointList([pt], size)[0], label };
  });

  const chooseSize = (n: number) => {
    if (n === size) return;
    setSize(n);
    setBlack([]);
    setWhite([]);
    root.children = [];
    root.props = {};
    setCursor(root);
    zoom.reset();
  };

  const toggleStone = (p: Point, color: Color) => {
    const mine = color === 'B' ? black : white;
    const set = color === 'B' ? setBlack : setWhite;
    const otherSet = color === 'B' ? setWhite : setBlack;
    if (mine.some((q) => q.x === p.x && q.y === p.y)) set(mine.filter((q) => !(q.x === p.x && q.y === p.y)));
    else {
      set([...mine, p]);
      otherSet((o) => o.filter((q) => !(q.x === p.x && q.y === p.y)));
    }
  };

  const tap = (p: Point) => {
    setError('');
    if (step === 'black') return toggleStone(p, 'B');
    if (step === 'white') return toggleStone(p, 'W');
    if (step !== 'tree') return;

    if (tool === 'label') {
      if (board.get(p)) return;
      const pt = pointToSgf(p);
      const cur = cursor.props.LB ?? [];
      if (cur.some((v) => v.startsWith(pt + ':'))) {
        const next = cur.filter((v) => !v.startsWith(pt + ':'));
        if (next.length) cursor.props.LB = next;
        else delete cursor.props.LB;
      } else {
        const used = new Set(cur.map((v) => v.split(':')[1]));
        const letter = [...LETTERS].find((l) => !used.has(l));
        if (letter) cursor.props.LB = [...cur, `${pt}:${letter}`];
      }
      force();
      return;
    }

    if (!board.play(p, nextColor)) return; // occupied, suicide or ko
    const sg = pointToSgf(p);
    let node = cursor.children.find((c) => c.props[nextColor]?.[0] === sg);
    if (!node) {
      node = { props: { [nextColor]: [sg] }, children: [], parent: cursor };
      cursor.children.push(node);
    }
    setCursor(node);
    setSwap(false);
  };

  const onTap = zoomedTap(zoom, tap);

  const setMark = (m: Mark) => {
    if (cursor === root) return;
    delete cursor.props.TE;
    delete cursor.props.BM;
    if (m === 'correct') cursor.props.TE = ['1'];
    if (m === 'incorrect') cursor.props.BM = ['1'];
    force();
  };

  const setComment = (t: string) => {
    if (t) cursor.props.C = [t];
    else delete cursor.props.C;
    force();
  };

  const deleteNode = () => {
    if (cursor === root || !cursor.parent) return;
    const parent = cursor.parent;
    parent.children = parent.children.filter((c) => c !== cursor);
    setCursor(parent);
  };

  const save = () => {
    if (!root.children.length) return setError('Add at least one move to the tree first.');
    root.props = {
      ...root.props,
      GM: ['1'],
      FF: ['4'],
      SZ: [String(size)],
      GN: [title.trim() || 'Untitled'],
      PL: [first],
    };
    if (black.length) root.props.AB = black.map(pointToSgf);
    else delete root.props.AB;
    if (white.length) root.props.AW = white.map(pointToSgf);
    else delete root.props.AW;
    onSave({
      id: initial?.id ?? `c-${Date.now()}`,
      title: title.trim() || 'Untitled',
      sgf: toSgf(root),
    });
  };

  const stepIdx = STEPS.indexOf(step);
  const crumbs = path.map((n) => {
    const m = nodeMove(n, size)!;
    return `${m.color === 'B' ? '●' : '○'}${m.point ? coordName(m.point, size) : 'pass'}${markOf(n) === 'correct' ? '✓' : markOf(n) === 'incorrect' ? '✗' : ''}`;
  });

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Btn label="‹ Cancel" kind="ghost" onPress={onCancel} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>{initial ? 'Edit puzzle' : 'New puzzle'}</Text>
          <Text style={styles.sub}>
            Step {stepIdx + 1}/4 · {TITLES[step]}
          </Text>
        </View>
        {zoom.canZoom ? (
          <Btn label={zoom.mode === 'off' ? 'Zoom (z)' : zoom.mode === 'armed' ? 'Tap area…' : 'Zoomed'} kind={zoom.mode === 'off' ? 'ghost' : 'solid'} onPress={zoom.toggle} />
        ) : null}
      </View>

      <View style={[styles.boardBox, zoom.mode === 'armed' && { borderColor: theme.accent }]}>
        <BoardView
          board={board}
          view={zoom.view}
          width={boardW}
          last={lastMove}
          hints={[]}
          markup={step === 'tree' ? labels.filter((l) => l.point).map((l) => ({ kind: 'LB' as const, point: l.point, label: l.label })) : []}
          onPlay={onTap}
        />
      </View>

      {step === 'size' && (
        <View style={styles.panel}>
          <Text style={styles.hint}>Choose the board size.</Text>
          <View style={styles.row}>
            {[9, 13, 19].map((n) => (
              <Btn key={n} label={`${n}×${n}`} kind={size === n ? 'solid' : 'ghost'} onPress={() => chooseSize(n)} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              value={customSize}
              onChangeText={setCustomSize}
              placeholder="Custom (5–25)"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              style={[styles.input, { flex: 1 }]}
            />
            <Btn
              label="Use"
              kind="ghost"
              onPress={() => {
                const n = parseInt(customSize, 10);
                if (n >= 5 && n <= 25) chooseSize(n);
              }}
            />
          </View>
        </View>
      )}

      {(step === 'black' || step === 'white') && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Tap to add or remove {step === 'black' ? 'black' : 'white'} starting stones ({(step === 'black' ? black : white).length} placed).
          </Text>
          <Btn label="Clear" kind="ghost" onPress={() => (step === 'black' ? setBlack([]) : setWhite([]))} />
        </View>
      )}

      {step === 'tree' && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Tap to play {nextColor === 'B' ? 'Black' : 'White'}. Moves alternate; each node can be marked correct, incorrect or neutral.
          </Text>
          <Text style={styles.crumbs}>{crumbs.length ? crumbs.join('  →  ') : 'Start position'}</Text>

          <View style={styles.row}>
            <Btn label="Move" kind={tool === 'move' ? 'solid' : 'ghost'} onPress={() => setTool('move')} />
            <Btn label="Label A/B/C" kind={tool === 'label' ? 'solid' : 'ghost'} onPress={() => setTool('label')} />
            <Btn label={`Next: ${nextColor === 'B' ? 'White' : 'Black'}`} kind="ghost" onPress={() => setSwap((v) => !v)} />
          </View>
          {root.children.length === 0 && cursor === root ? (
            <View style={styles.row}>
              <Text style={styles.hint}>First to play:</Text>
              <Btn label="Black" kind={first === 'B' ? 'solid' : 'ghost'} onPress={() => setFirst('B')} />
              <Btn label="White" kind={first === 'W' ? 'solid' : 'ghost'} onPress={() => setFirst('W')} />
            </View>
          ) : null}

          {cursor !== root ? (
            <View style={styles.row}>
              {(['correct', 'incorrect', 'neutral'] as Mark[]).map((m) => (
                <Btn key={m} label={m[0].toUpperCase() + m.slice(1)} kind={markOf(cursor) === m ? 'solid' : 'ghost'} onPress={() => setMark(m)} />
              ))}
            </View>
          ) : null}

          <TextInput
            value={cursor.props.C?.[0] ?? ''}
            onChangeText={setComment}
            placeholder="Comment for this node (optional)"
            placeholderTextColor={theme.muted}
            style={styles.input}
            multiline
          />

          {cursor.children.length ? (
            <View style={styles.row}>
              <Text style={styles.hint}>Variations:</Text>
              {cursor.children.map((c, i) => {
                const m = nodeMove(c, size)!;
                const mk = markOf(c);
                return (
                  <Btn
                    key={i}
                    kind="ghost"
                    label={`${m.color === 'B' ? '●' : '○'} ${m.point ? coordName(m.point, size) : 'pass'}${mk === 'correct' ? ' ✓' : mk === 'incorrect' ? ' ✗' : ''}`}
                    onPress={() => setCursor(c)}
                  />
                );
              })}
            </View>
          ) : null}

          <View style={styles.row}>
            <Btn label="↑ Parent" kind="ghost" disabled={cursor === root} onPress={() => cursor.parent && setCursor(cursor.parent)} />
            <Btn label="Delete node" kind="ghost" disabled={cursor === root} onPress={deleteNode} />
          </View>

          <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={theme.muted} style={styles.input} />
          {error ? <Text style={{ color: '#e5484d' }}>{error}</Text> : null}
          <Btn label="Save puzzle" onPress={save} />
        </View>
      )}

      <View style={styles.row}>
        <Btn
          label="‹ Back"
          kind="ghost"
          disabled={stepIdx === 0}
          onPress={() => {
            zoom.reset();
            setStep(STEPS[stepIdx - 1]);
          }}
        />
        {step !== 'tree' ? (
          <Btn
            label="Next ›"
            onPress={() => {
              zoom.reset();
              setStep(STEPS[stepIdx + 1]);
            }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 560 },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  sub: { color: theme.muted, fontSize: 13 },
  boardBox: { borderRadius: 8, borderWidth: 3, borderColor: 'transparent' },
  panel: { width: '100%', maxWidth: 560, gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  hint: { color: theme.muted, fontSize: 14 },
  crumbs: { color: theme.text, fontSize: 14 },
  input: { backgroundColor: theme.card, color: theme.text, borderRadius: 8, padding: 12, fontSize: 15 },
});
