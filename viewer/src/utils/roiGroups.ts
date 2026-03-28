export interface LobeGroup {
  name: string;
  roiNames: string[]; // HCP ROI names belonging to this lobe
  cameraPosition: [number, number, number];
  cameraUp: [number, number, number];
}

export const LOBE_GROUPS: LobeGroup[] = [
  {
    name: "Frontal",
    roiNames: [
      "4",
      "6a",
      "6d",
      "6ma",
      "6mp",
      "6r",
      "6v",
      "8Ad",
      "8Av",
      "8BL",
      "8BM",
      "8C",
      "9-46d",
      "9a",
      "9m",
      "9p",
      "10d",
      "10pp",
      "10r",
      "10v",
      "11l",
      "13l",
      "44",
      "45",
      "46",
      "47l",
      "47m",
      "47s",
      "55b",
      "a10p",
      "a9-46v",
      "p9-46v",
      "a47r",
      "p47r",
      "FEF",
      "IFJa",
      "IFJp",
      "IFSa",
      "IFSp",
      "OFC",
      "pOFC",
      "SFL",
      "SCEF",
      "i6-8",
      "s6-8",
      "a32pr",
      "p32",
      "p32pr",
      "d32",
      "s32",
      "p10p",
    ],
    cameraPosition: [0, 300, 0],
    cameraUp: [0, 0, 1],
  },
  {
    name: "Temporal",
    roiNames: [
      "A1",
      "A4",
      "A5",
      "EC",
      "H",
      "LBelt",
      "MBelt",
      "PBelt",
      "PHT",
      "PeEc",
      "Pir",
      "PSL",
      "RI",
      "STGa",
      "STSda",
      "STSdp",
      "STSva",
      "STSvp",
      "STV",
      "TA2",
      "TE1a",
      "TE1m",
      "TE1p",
      "TE2a",
      "TE2p",
      "TF",
      "TGd",
      "TGv",
      "52",
      "43",
    ],
    cameraPosition: [-300, 0, 0],
    cameraUp: [0, 0, 1],
  },
  {
    name: "Parietal",
    roiNames: [
      "1",
      "2",
      "3a",
      "3b",
      "5L",
      "5m",
      "5mv",
      "7AL",
      "7Am",
      "7PC",
      "7PL",
      "7Pm",
      "7m",
      "AIP",
      "IP0",
      "IP1",
      "IP2",
      "IPS1",
      "LIPd",
      "LIPv",
      "MIP",
      "PCV",
      "PF",
      "PFcm",
      "PFm",
      "PFop",
      "PFt",
      "PGi",
      "PGp",
      "PGs",
      "VIP",
      "PEF",
      "TPOJ1",
      "TPOJ2",
      "TPOJ3",
    ],
    cameraPosition: [300, 0, 0],
    cameraUp: [0, 0, 1],
  },
  {
    name: "Occipital",
    roiNames: [
      "V1",
      "V2",
      "V3",
      "V3A",
      "V3B",
      "V3CD",
      "V4",
      "V4t",
      "V6",
      "V6A",
      "V7",
      "V8",
      "LO1",
      "LO2",
      "LO3",
      "MST",
      "MT",
      "FST",
      "FFC",
      "PIT",
      "VMV1",
      "VMV2",
      "VMV3",
      "VVC",
      "PH",
      "PHA1",
      "PHA2",
      "PHA3",
      "DVT",
      "POS1",
      "POS2",
      "PreS",
      "ProS",
    ],
    cameraPosition: [0, -300, 0],
    cameraUp: [0, 0, 1],
  },
  {
    name: "Insular",
    roiNames: [
      "AAIC",
      "AVI",
      "Ig",
      "MI",
      "OP1",
      "OP2-3",
      "OP4",
      "PI",
      "PoI1",
      "PoI2",
      "FOP1",
      "FOP2",
      "FOP3",
      "FOP4",
      "FOP5",
    ],
    cameraPosition: [-300, 100, 0],
    cameraUp: [0, 0, 1],
  },
  {
    name: "Cingulate",
    roiNames: [
      "23c",
      "23d",
      "24dd",
      "24dv",
      "25",
      "31a",
      "31pd",
      "31pv",
      "33pr",
      "RSC",
      "a24",
      "a24pr",
      "p24",
      "p24pr",
      "d23ab",
      "v23ab",
    ],
    cameraPosition: [0, 0, 300],
    cameraUp: [0, 1, 0],
  },
];

/**
 * Build a reverse lookup from ROI name to lobe name.
 * Each ROI is assigned to exactly one lobe (no duplicates).
 * Priority: more specific groups (Insular, Cingulate) win over broader (Frontal).
 */
function buildRoiToLobeMap(): Map<string, string> {
  const map = new Map<string, string>();

  // Process in priority order: specific groups last so they overwrite broader ones.
  // Frontal first (lowest priority for overlapping ROIs), then general groups,
  // then Insular and Cingulate (highest priority for overlaps).
  const priorityOrder = [
    "Frontal",
    "Temporal",
    "Parietal",
    "Occipital",
    "Insular",
    "Cingulate",
  ];

  const groupsByName = new Map(LOBE_GROUPS.map((g) => [g.name, g]));

  for (const lobeName of priorityOrder) {
    const group = groupsByName.get(lobeName)!;
    for (const roi of group.roiNames) {
      map.set(roi, lobeName);
    }
  }

  return map;
}

const ROI_TO_LOBE = buildRoiToLobeMap();

/**
 * Takes the ROI name list and per-vertex label array from the exported data,
 * and returns a Map from lobe name to an array of vertex indices belonging
 * to that lobe. This is the key lookup used to average activation values
 * per lobe.
 *
 * @param roiNames  - Array of ROI name strings (index 0 is typically "unknown")
 * @param vertexLabels - Uint16Array where each element is the ROI index for that vertex
 * @returns Map from lobe name (e.g. "Frontal") to array of vertex indices
 */
export function buildLobeVertexMap(
  roiNames: string[],
  vertexLabels: Uint16Array,
): Map<string, number[]> {
  const lobeVertices = new Map<string, number[]>();

  // Pre-initialize arrays for each lobe
  for (const group of LOBE_GROUPS) {
    lobeVertices.set(group.name, []);
  }

  for (let vertexIdx = 0; vertexIdx < vertexLabels.length; vertexIdx++) {
    const roiIndex = vertexLabels[vertexIdx];
    const roiName = roiNames[roiIndex];
    if (roiName === undefined) continue;

    const lobeName = ROI_TO_LOBE.get(roiName);
    if (lobeName === undefined) continue; // ROI not in any group (e.g. "unknown", "?")

    lobeVertices.get(lobeName)!.push(vertexIdx);
  }

  return lobeVertices;
}
