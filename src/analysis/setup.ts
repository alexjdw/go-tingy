/**
 * What the player needs to do to get KataGo working with this app, for their operating system. The versions and
 * links are the ones this app was built and tried with (a newer KataGo release or network will most likely work too).
 */

export const KATAGO_VERSION = 'v1.18.1';
const RELEASE = `https://github.com/lightvector/KataGo/releases/download/${KATAGO_VERSION}`;

/** The network the app was tried with: KataGo's 18-block "b18c384nbt" (about 93 MB). */
export const NETWORK = {
  name: 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  size: '93 MB',
};

export const CONFIG = {
  name: 'analysis_example.cfg',
  url: `https://raw.githubusercontent.com/lightvector/KataGo/${KATAGO_VERSION}/cpp/configs/analysis_example.cfg`,
};

export interface Link {
  label: string;
  url: string;
}

export interface SetupGuide {
  /** "Windows", "macOS", "Linux" */
  os: string;
  /** false where this guide could not be tried (or KataGo has no program for the system) */
  tested: boolean;
  steps: string[];
  links: Link[];
  /** something to know, after the steps */
  note?: string;
  /** an extra line: what to do if the first choice does not run */
  fallback?: string;
}

const FIRST_RUN =
  'The first time KataGo is asked something it tunes itself for your graphics card, which can take a few minutes.';

export function setupGuide(platform: string, arch: string): SetupGuide {
  const network: Link = { label: `Download the network (${NETWORK.size})`, url: NETWORK.url };
  const keep = 'Save it in the same folder without unzipping it (the file name ends in .bin.gz).';
  if (platform === 'win32') {
    return {
      os: 'Windows',
      tested: true,
      links: [
        {
          label: 'Download KataGo (OpenCL, works with any graphics card)',
          url: `${RELEASE}/katago-${KATAGO_VERSION}-opencl-windows-x64.zip`,
        },
        network,
      ],
      steps: [
        'Download KataGo (the first link) and unzip it. Copy everything inside into the folder below, so that katago.exe sits directly in it.',
        `Download the network (the second link). ${keep}`,
        'Press "Check again".',
      ],
      note: FIRST_RUN,
      fallback: `No usable graphics card, or KataGo does not start? Use the CPU build instead (slower): ${RELEASE}/katago-${KATAGO_VERSION}-eigenavx2-windows-x64.zip`,
    };
  }
  if (platform === 'darwin') {
    return {
      os: 'macOS',
      tested: false,
      links: [
        { label: 'KataGo in Homebrew', url: 'https://formulae.brew.sh/formula/katago' },
        network,
        { label: 'Download the configuration file', url: CONFIG.url },
      ],
      steps: [
        'KataGo has no download for macOS. Install it with Homebrew: open Terminal and run  brew install katago',
        `Download the network and the configuration file (the second and third links) and save both in the folder below. The network must keep its .bin.gz ending, and the configuration file must be called ${CONFIG.name}.`,
        'Press "Check again".',
      ],
      note: 'If macOS refuses to run KataGo, allow it in System Settings, Privacy and Security. These steps have not been tried on a Mac.',
    };
  }
  if (platform === 'linux' && (arch === 'x64' || arch === 'amd64')) {
    return {
      os: 'Linux',
      tested: false,
      links: [
        { label: 'Download KataGo (OpenCL)', url: `${RELEASE}/katago-${KATAGO_VERSION}-opencl-linux-x64.zip` },
        network,
      ],
      steps: [
        'Download KataGo (the first link) and unzip it. Copy everything inside into the folder below, so that the katago file sits directly in it, then make it runnable:  chmod +x katago',
        `Download the network (the second link). ${keep}`,
        'Press "Check again".',
      ],
      note: FIRST_RUN,
      fallback: `No OpenCL support? Use the CPU build instead (slower): ${RELEASE}/katago-${KATAGO_VERSION}-eigenavx2-linux-x64.zip. These steps have not been tried on Linux.`,
    };
  }
  return {
    os: platform === 'linux' ? `Linux (${arch})` : platform,
    tested: false,
    links: [
      { label: 'KataGo on GitHub (build instructions)', url: 'https://github.com/lightvector/KataGo#compiling-katago' },
      network,
      { label: 'Download the configuration file', url: CONFIG.url },
    ],
    steps: [
      `KataGo has no ready-made program for ${platform} (${arch}). Build or install it yourself (the first link), then save the network, the configuration file and the program in the folder below.`,
      'Press "Check again".',
    ],
  };
}
