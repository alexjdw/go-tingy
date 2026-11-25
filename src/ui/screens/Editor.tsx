/* eslint-disable react-hooks/immutability --
 * The puzzle being edited is a mutable SgfNode tree held in state, and every edit mutates it and then calls
 * force() to re-render. Making this immutable (copy-on-write nodes) is a worthwhile refactor, but until then
 * the compiler-oriented immutability rule can't apply here. */
import { useCallback, useMemo, useReducer, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { Problem } from '../../data/samples';
import { Board } from '../../go/board';
import {
  type Color,
  type Dims,
  type Edge,
  type OpenEdges,
  type Point,
  type SgfNode,
  MAX_DIM,
  MIN_DIM,
  NO_OPEN_EDGES,
  allPoints,
  boardDims,
  coordName,
  firstMoveColor,
  nodeMove,
  openEdges,
  parseSgf,
  pointList,
  pointToSgf,
  toSgf,
} from '../../sgf/parser';
import { fullViewport } from '../../go/viewport';
import { BOARD_PRESETS, resizeSetup, writeBoardProps } from '../../sgf/editing';
import { describeExchange } from '../../analysis/describe';
import { favoriteOf, reviewPuzzle } from '../../analysis/review';
import { isRefuted, judgeMove, suggestMoves } from '../../analysis/suggest';
import { BoardView } from '../components/Board';
import { type Check, CheckPanel } from '../components/CheckPanel';
import { EnginePanel } from '../components/EnginePanel';
import { TreeView } from '../components/TreeView';
import { Btn, theme } from '../components/theme';
import { useEngine } from '../engine';
import { useArrowKeys } from '../keys';
import { nodeByKey, preferredChild } from '../../study/lines';
import { layoutTree, treeSignature } from '../../study/treeLayout';
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
/** How much KataGo thinks about an answer to a new move (about a second), and about each position when checking. */
const AI_VISITS = 300;
const CHECK_VISITS = 200;
const CHECK_QUERIES = 60;
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
    const dims = boardDims(root);
    const open = openEdges(root);
    const black = pointList(root.props.AB, dims);
    const white = pointList(root.props.AW, dims);
    const first = firstMoveColor(root);
    delete root.props.AB;
    delete root.props.AW;
    return { root, dims, open, black, white, first };
  }, [initial]);

  const [, force] = useReducer((n: number) => n + 1, 0);
  const [step, setStep] = useState<Step>(init ? 'tree' : 'size');
  const [dims, setDims] = useState<Dims>(init?.dims ?? { cols: 19, rows: 19 });
  const [open, setOpen] = useState<OpenEdges>(init?.open ?? NO_OPEN_EDGES);
  const [colsText, setColsText] = useState(String(init?.dims.cols ?? 19));
  const [rowsText, setRowsText] = useState(String(init?.dims.rows ?? 19));
  const [notice, setNotice] = useState('');
  const [black, setBlack] = useState<Point[]>(init?.black ?? []);
  const [white, setWhite] = useState<Point[]>(init?.white ?? []);
  const [root] = useState<SgfNode>(() => init?.root ?? { props: {}, children: [], parent: null });
  const [cursor, setCursor] = useState<SgfNode>(root);
  const [first, setFirst] = useState<Color>(init?.first ?? 'B');
  const [swap, setSwap] = useState(false);
  const [tool, setTool] = useState<Tool>('move');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [error, setError] = useState('');
  // KataGo helping with the tree: answers each new move, and checks the puzzle before it is saved. Can be switched off.
  const [ai, setAi] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  /** the move KataGo marked wrong, while the author can still take that back */
  const [autoMark, setAutoMark] = useState<SgfNode | null>(null);
  const [check, setCheck] = useState<Check | null>(null);

  const base = useMemo(() => fullViewport(dims), [dims]);
  const zoom = useZoom(base);

  // Board at the cursor: setup stones, then every move on the path from the root.
  const path: SgfNode[] = [];
  for (let n: SgfNode | null = cursor; n && n !== root; n = n.parent) path.unshift(n);
  let board = new Board(dims.cols, dims.rows);
  for (const p of black) board = board.withStone(p, 'B');
  for (const p of white) board = board.withStone(p, 'W');
  if (step === 'tree') {
    for (const n of path) {
      const m = nodeMove(n, dims);
      if (m) board = board.play(m.point, m.color)?.board ?? board;
    }
  }
  const lastMove = cursor !== root ? (nodeMove(cursor, dims)?.point ?? null) : null;

  const lastColor = cursor !== root ? nodeMove(cursor, dims)?.color : undefined;
  const natural: Color = lastColor ? other(lastColor) : first;
  const nextColor: Color = swap ? other(natural) : natural;

  // The picture of the tree is laid out again only when its moves or marks change (the tree is edited in place).
  const signature = treeSignature(root);
  const treeLayout = useMemo(() => layoutTree(root, dims), [signature, dims]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepBack = useCallback(() => {
    if (cursor.parent) setCursor(cursor.parent);
  }, [cursor]);
  const stepForward = useCallback(() => {
    const next = preferredChild(cursor);
    if (next) setCursor(next);
  }, [cursor]);
  useArrowKeys(step === 'tree' ? { onLeft: stepBack, onRight: stepForward } : null);

  const engine = useEngine([cursor, nextColor, step]);
  const aiOn = engine.available && engine.status?.ready === true && ai;
  const suggestions = engine.state.kind === 'done' ? engine.state.moves : [];
  const askEngine = (maxVisits: number) =>
    engine.ask((analyzer) =>
      suggestMoves(
        analyzer,
        { dims, open, black, white, player: first },
        path.flatMap((n) => {
          const m = nodeMove(n, dims);
          return m ? [m] : [];
        }),
        nextColor,
        allPoints(root),
        { maxVisits },
      ),
    );

  /** The move just added is answered by KataGo's best reply: a one-exchange branch to look at or keep. */
  const exchange = async (mine: SgfNode, color: Color) => {
    if (!engine.analyzer) return;
    setAiBusy(true);
    setAiNote('');
    setAutoMark(null);
    try {
      const played: { color: Color; point: Point | null }[] = [];
      for (let n: SgfNode | null = mine; n && n !== root; n = n.parent) {
        const m = nodeMove(n, dims);
        if (m) played.unshift(m);
      }
      const setup = { dims, open, black, white, player: first };
      const points = allPoints(root);
      const analyzer = engine.analyzer;
      // The reply, and (for the puzzle's first player) the favorite move to measure this move against, at the same time.
      const [replies, alternatives] = await Promise.all([
        suggestMoves(analyzer, setup, played, other(color), points, { maxVisits: AI_VISITS, count: 1 }),
        color === first
          ? suggestMoves(analyzer, setup, played.slice(0, -1), color, points, { maxVisits: AI_VISITS, count: 8 }).catch(
              () => [],
            )
          : Promise.resolve([]),
      ]);
      const reply = replies[0];
      if (!mine.parent?.children.includes(mine)) return; // deleted while KataGo was thinking
      if (!reply?.point) {
        setAiNote('KataGo would pass here: there is nothing more to refute.');
        return;
      }
      const sg = pointToSgf(reply.point);
      const them = other(color);
      let node = mine.children.find((c) => c.props[them]?.[0] === sg);
      if (!node) {
        node = { props: { [them]: [sg] }, children: [], parent: mine };
        mine.children.push(node);
      }
      const answer = node;
      setCursor((c) => (c === mine ? answer : c));

      // A first-player move that gives away a lot is refuted: mark it wrong (the author can undo that).
      const favorite = favoriteOf(alternatives);
      const judgement = favorite ? judgeMove(favorite, reply.winrate, reply.scoreLead) : null;
      const marked = !!judgement && isRefuted(judgement) && !mine.props.TE && !mine.props.BM;
      if (marked) {
        mine.props.BM = ['1'];
        setAutoMark(mine);
      }
      const move = nodeMove(mine, dims)?.point;
      setAiNote(
        describeExchange({
          mover: color === 'B' ? 'Black' : 'White',
          move: move ? coordName(move, dims) : 'pass',
          answer: coordName(reply.point, dims),
          chance: Math.round((1 - reply.winrate) * 100),
          judgement,
          favorite: favorite?.point ? coordName(favorite.point, dims) : null,
          marked,
          dims,
        }),
      );
      force();
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const labels = (cursor.props.LB ?? []).map((v) => {
    const [pt, label] = v.split(':');
    return { point: pointList([pt], dims)[0], label };
  });

  /** Resize the board, keeping whatever still fits. Moves outside the new board can't be kept, so the tree goes. */
  const resizeTo = (next: Dims) => {
    if (next.cols === dims.cols && next.rows === dims.rows) return;
    const r = resizeSetup(black, white, root, dims, next);
    const clearTree = root.children.length > 0 && !r.treeFits;
    setDims(next);
    setBlack(r.black);
    setWhite(r.white);
    if (clearTree) {
      root.children = [];
      setCursor(root);
    }
    const parts = [
      r.dropped ? `${r.dropped} stone${r.dropped > 1 ? 's' : ''} outside the board removed` : '',
      clearTree ? 'the move tree had moves outside the board and was cleared' : '',
    ].filter(Boolean);
    setNotice(parts.length ? `Resized to ${next.cols}×${next.rows}: ${parts.join('; ')}.` : '');
    zoom.reset();
  };

  const dimValue = (text: string) => (/^\d{1,2}$/.test(text.trim()) ? parseInt(text, 10) : NaN);
  const dimOk = (n: number) => n >= MIN_DIM && n <= MAX_DIM;

  const applyDim = (axis: 'cols' | 'rows', text: string) => {
    (axis === 'cols' ? setColsText : setRowsText)(text);
    const n = dimValue(text);
    if (dimOk(n)) resizeTo({ ...dims, [axis]: n });
  };

  const choosePreset = (d: Dims) => {
    setColsText(String(d.cols));
    setRowsText(String(d.rows));
    resizeTo(d);
  };

  const toggleEdge = (edge: Edge) => setOpen((o) => ({ ...o, [edge]: !o[edge] }));
  const setAllEdges = (isOpen: boolean) => setOpen({ top: isOpen, right: isOpen, bottom: isOpen, left: isOpen });

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

    if (aiBusy) return; // KataGo is still answering the last move
    if (!board.play(p, nextColor)) return; // occupied, suicide or ko
    const sg = pointToSgf(p);
    let node = cursor.children.find((c) => c.props[nextColor]?.[0] === sg);
    const created = !node;
    if (!node) {
      node = { props: { [nextColor]: [sg] }, children: [], parent: cursor };
      cursor.children.push(node);
    }
    setCheck(null);
    setCursor(node);
    if (created && aiOn) void exchange(node, nextColor);
    setSwap(false);
  };

  const onTap = (p: Point) => zoomedTap(zoom, p, tap);

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

  /** The puzzle as it would be saved, or null (with the reason shown) if it is not ready. The tree itself is not touched. */
  const build = (): Problem | null => {
    if (!root.children.length) {
      setError('Add at least one move to the tree first.');
      return null;
    }
    const out: SgfNode = {
      props: { ...root.props, GM: ['1'], FF: ['4'], GN: [title.trim() || 'Untitled'], PL: [first] },
      children: root.children,
      parent: null,
    };
    writeBoardProps(out, dims, open);
    if (black.length) out.props.AB = black.map(pointToSgf);
    else delete out.props.AB;
    if (white.length) out.props.AW = white.map(pointToSgf);
    else delete out.props.AW;
    // keep what else the puzzle has (the collection it is in, for one)
    return { ...initial, id: initial?.id ?? `c-${Date.now()}`, title: title.trim() || 'Untitled', sgf: toSgf(out) };
  };

  /** Save; with KataGo on, check the puzzle first and let the author decide if it finds something. */
  const save = async () => {
    setError('');
    const problem = build();
    if (!problem) return;
    if (!aiOn || !engine.analyzer) return onSave(problem);
    setCheck({ kind: 'running' });
    try {
      const review = await reviewPuzzle(problem.sgf, engine.analyzer, {
        maxVisits: CHECK_VISITS,
        maxQueries: CHECK_QUERIES,
      });
      if (review.verdict === 'agrees') return onSave(problem);
      setCheck({ kind: 'done', review, problem, signature });
    } catch (e) {
      setCheck({ kind: 'failed', message: e instanceof Error ? e.message : String(e), problem, signature });
    }
  };

  const jumpToKey = (key: string) => {
    const node = nodeByKey(root, key);
    if (node) setCursor(node);
  };

  const stepIdx = STEPS.indexOf(step);
  const crumbs = path.map((n) => {
    const m = nodeMove(n, dims)!;
    return `${m.color === 'B' ? '●' : '○'}${m.point ? coordName(m.point, dims) : 'pass'}${markOf(n) === 'correct' ? '✓' : markOf(n) === 'incorrect' ? '✗' : ''}`;
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
          <Btn
            label={zoom.mode === 'off' ? 'Zoom (z)' : zoom.mode === 'armed' ? 'Tap area…' : 'Zoomed'}
            kind={zoom.mode === 'off' ? 'ghost' : 'solid'}
            onPress={zoom.toggle}
          />
        ) : null}
      </View>

      <View style={[styles.boardBox, zoom.mode === 'armed' && { borderColor: theme.accent }]}>
        <BoardView
          board={board}
          view={zoom.view}
          width={boardW}
          last={lastMove}
          hints={[]}
          markup={
            step === 'tree'
              ? [
                  ...labels
                    .filter((l) => l.point)
                    .map((l) => ({ kind: 'LB' as const, point: l.point, label: l.label })),
                  ...suggestions.flatMap((m, i) =>
                    m.point && !board.get(m.point)
                      ? [{ kind: 'LB' as const, point: m.point, label: String(i + 1) }]
                      : [],
                  ),
                ]
              : []
          }
          onPlay={onTap}
          open={open}
        />
      </View>

      {step === 'size' && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Board: {dims.cols}×{dims.rows}. Pick a size, or set the width and height yourself.
          </Text>
          <View style={styles.row}>
            {BOARD_PRESETS.map((d) => (
              <Btn
                key={`${d.cols}x${d.rows}`}
                label={`${d.cols}×${d.rows}`}
                kind={dims.cols === d.cols && dims.rows === d.rows ? 'solid' : 'ghost'}
                onPress={() => choosePreset(d)}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Text style={styles.hint}>Width</Text>
            <TextInput
              value={colsText}
              onChangeText={(t) => applyDim('cols', t)}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Board width"
              style={[styles.input, styles.dimInput, !dimOk(dimValue(colsText)) && styles.invalid]}
            />
            <Text style={styles.hint}>× Height</Text>
            <TextInput
              value={rowsText}
              onChangeText={(t) => applyDim('rows', t)}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Board height"
              style={[styles.input, styles.dimInput, !dimOk(dimValue(rowsText)) && styles.invalid]}
            />
            <Text style={styles.hint}>
              ({MIN_DIM}–{MAX_DIM})
            </Text>
          </View>

          <Text style={styles.hint}>
            Borders: turn one off for a diagram cropped from a bigger board (a corner, a side, or the middle).
          </Text>
          <View style={styles.row}>
            {(['top', 'right', 'bottom', 'left'] as Edge[]).map((edge) => (
              <Btn
                key={edge}
                label={`${edge[0].toUpperCase()}${edge.slice(1)}: ${open[edge] ? 'open' : 'border'}`}
                kind={open[edge] ? 'ghost' : 'solid'}
                onPress={() => toggleEdge(edge)}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Btn label="Remove all borders" kind="ghost" onPress={() => setAllEdges(true)} />
            <Btn label="Restore all borders" kind="ghost" onPress={() => setAllEdges(false)} />
          </View>
          <Text style={styles.hint}>
            Open sides only change how the board is drawn. Stones on the last row still have no liberties beyond it, so
            leave room as you would on the full board.
          </Text>
          {notice ? <Text style={styles.hint}>{notice}</Text> : null}
        </View>
      )}

      {(step === 'black' || step === 'white') && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Tap to add or remove {step === 'black' ? 'black' : 'white'} starting stones (
            {(step === 'black' ? black : white).length} placed).
          </Text>
          <Btn label="Clear" kind="ghost" onPress={() => (step === 'black' ? setBlack([]) : setWhite([]))} />
        </View>
      )}

      {step === 'tree' && (
        <View style={styles.panel}>
          <Text style={styles.hint}>
            Tap to play {nextColor === 'B' ? 'Black' : 'White'}. Moves alternate; each node can be marked correct,
            incorrect or neutral.
          </Text>
          <Text style={styles.crumbs}>{crumbs.length ? crumbs.join('  →  ') : 'Start position'}</Text>
          <TreeView layout={treeLayout} current={cursor} onSelect={setCursor} />

          <View style={styles.row}>
            <Btn label="Move" kind={tool === 'move' ? 'solid' : 'ghost'} onPress={() => setTool('move')} />
            <Btn label="Label A/B/C" kind={tool === 'label' ? 'solid' : 'ghost'} onPress={() => setTool('label')} />
            <Btn
              label={`Next: ${nextColor === 'B' ? 'White' : 'Black'}`}
              kind="ghost"
              onPress={() => setSwap((v) => !v)}
            />
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
                <Btn
                  key={m}
                  label={m[0].toUpperCase() + m.slice(1)}
                  kind={markOf(cursor) === m ? 'solid' : 'ghost'}
                  onPress={() => setMark(m)}
                />
              ))}
            </View>
          ) : null}

          {engine.available ? (
            <View style={styles.row}>
              <Btn
                label={`KataGo helps: ${aiOn ? 'on' : 'off'}`}
                kind={aiOn ? 'solid' : 'ghost'}
                onPress={() => setAi((v) => !v)}
                disabled={!engine.status?.ready}
                accessibilityLabel={aiOn ? 'KataGo helps: on' : 'KataGo helps: off'}
              />
              <Text style={[styles.hint, { flex: 1 }]}>
                {engine.status && !engine.status.ready
                  ? 'KataGo is not set up yet, so you build the tree by hand and nothing is checked (see below).'
                  : ai
                    ? 'On: KataGo answers each new move you play and checks the puzzle before you save.'
                    : 'Off: you build the tree by hand.'}
              </Text>
            </View>
          ) : null}
          {aiBusy ? <Text style={styles.hint}>KataGo is thinking…</Text> : null}
          {aiNote ? <Text style={styles.hint}>{aiNote}</Text> : null}
          {autoMark?.props.BM ? (
            <Btn
              label="Undo the wrong mark"
              kind="ghost"
              onPress={() => {
                delete autoMark.props.BM;
                setAutoMark(null);
                setAiNote('Took the wrong mark off again.');
                force();
              }}
            />
          ) : null}
          <EnginePanel
            available={engine.available}
            status={engine.status}
            state={engine.state}
            toMove={nextColor}
            dims={dims}
            onAsk={askEngine}
            onRecheck={engine.recheck}
            onOpenFolder={engine.openFolder}
          />

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
                const m = nodeMove(c, dims)!;
                const mk = markOf(c);
                return (
                  <Btn
                    key={i}
                    kind="ghost"
                    label={`${m.color === 'B' ? '●' : '○'} ${m.point ? coordName(m.point, dims) : 'pass'}${mk === 'correct' ? ' ✓' : mk === 'incorrect' ? ' ✗' : ''}`}
                    onPress={() => setCursor(c)}
                  />
                );
              })}
            </View>
          ) : null}

          <View style={styles.row}>
            <Btn
              label="↑ Parent"
              kind="ghost"
              disabled={cursor === root}
              onPress={() => cursor.parent && setCursor(cursor.parent)}
            />
            <Btn label="Delete node" kind="ghost" disabled={cursor === root} onPress={deleteNode} />
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.muted}
            style={styles.input}
          />
          {error ? <Text style={{ color: '#e5484d' }}>{error}</Text> : null}
          {check && (check.kind === 'running' || check.signature === signature) ? (
            <CheckPanel
              check={check}
              dims={dims}
              onJump={jumpToKey}
              onSaveAnyway={() => check.kind !== 'running' && onSave(check.problem)}
              onDismiss={() => setCheck(null)}
            />
          ) : null}
          <Btn label="Save puzzle" onPress={() => void save()} disabled={check?.kind === 'running'} />
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
  dimInput: { width: 64, textAlign: 'center' },
  invalid: { borderWidth: 2, borderColor: '#e5484d' },
});
