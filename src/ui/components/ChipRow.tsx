import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Btn } from './theme';

/** A button is 44 high (see `Btn`) and the rows are 8 apart. */
const ROW = 44;
const GAP = 8;
/** How many lines of buttons show before "View more". */
export const COLLAPSED_LINES = 3;
const COLLAPSED_HEIGHT = COLLAPSED_LINES * ROW + (COLLAPSED_LINES - 1) * GAP;

/**
 * A row of buttons that wraps onto more lines instead of scrolling sideways. Up to three lines show; with more, a
 * "View more" button opens them all, and "View less" folds them again.
 *
 * The buttons are laid out in full inside a clipped box and measured, so that the button only appears when something
 * is really hidden. (Do not use a bare horizontal ScrollView for button rows: on the web it shrinks to a sliver when
 * a long list below it claims the height.)
 */
export function ChipRow({ children }: { children: ReactNode }) {
  const [full, setFull] = useState(0);
  const [open, setOpen] = useState(false);
  const overflows = full > COLLAPSED_HEIGHT + 1;
  return (
    <View style={styles.box}>
      <View style={[styles.clip, !open && overflows && { maxHeight: COLLAPSED_HEIGHT }]}>
        <View style={styles.wrap} onLayout={(e) => setFull(e.nativeEvent.layout.height)}>
          {children}
        </View>
      </View>
      {overflows ? (
        <View style={styles.more}>
          <Btn
            label={open ? 'View less' : 'View more'}
            kind="ghost"
            accessibilityLabel={open ? 'View fewer' : 'View more'}
            onPress={() => setOpen((o) => !o)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexGrow: 0, flexShrink: 0, gap: GAP },
  clip: { overflow: 'hidden', flexShrink: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' },
  more: { alignSelf: 'flex-start' },
});
