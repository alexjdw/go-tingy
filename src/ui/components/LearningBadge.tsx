import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { SkillMark } from '../../progress/learning';

const NAMES: Record<SkillMark, string> = {
  red: 'just starting',
  yellow: 'getting there',
  green: 'guided stage cleared',
  sparkle: 'gold',
  diamond: 'diamond',
};

const SIZE = 18;

/** A round dot with a small highlight, like a glossy stone. */
function Dot({ fill, edge }: { fill: string; edge: string }) {
  return (
    <>
      <Circle cx={12} cy={12} r={9} fill={fill} stroke={edge} strokeWidth={1.5} />
      <Circle cx={8.8} cy={8.8} r={2.4} fill="#ffffff" opacity={0.45} />
    </>
  );
}

/** A four-pointed sparkle star. */
const STAR = 'M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z';

function Glyph({ mark }: { mark: SkillMark }) {
  switch (mark) {
    case 'red':
      return <Dot fill="#e5484d" edge="#8f1d22" />;
    case 'yellow':
      return <Dot fill="#f5c542" edge="#9a7410" />;
    case 'green':
      return <Dot fill="#3fb950" edge="#1c6b2b" />;
    case 'sparkle':
      return (
        <>
          <Path d={STAR} fill="#ffd54a" stroke="#b8860b" strokeWidth={1.2} strokeLinejoin="round" />
          <Circle cx={19.5} cy={4.5} r={1.6} fill="#fff3b0" />
          <Circle cx={4.5} cy={19.5} r={1.2} fill="#fff3b0" />
        </>
      );
    case 'diamond':
      return (
        <>
          <Polygon
            points="7,4 17,4 22,10 12,21 2,10"
            fill="#5ac8fa"
            stroke="#1b6f96"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <Polygon points="7,4 12,10 2,10" fill="#b8ecff" />
          <Polygon points="17,4 22,10 12,10" fill="#8fdcff" />
          <Polygon points="2,10 22,10 12,21" fill="#3aa6d8" />
          <Path d="M7 4 L12 10 L17 4 M12 10 L12 21" stroke="#1b6f96" strokeWidth={0.8} fill="none" />
        </>
      );
  }
}

/** The badge on a puzzle in learning: red, yellow and green dots, a gold star and a diamond. */
export function LearningBadge({ mark }: { mark: SkillMark }) {
  return (
    <View accessible accessibilityLabel={`Level: ${NAMES[mark]}`} style={styles.box}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
        <Glyph mark={mark} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14161aCC',
  },
});
