import type { SketchControls, WallZProfile } from '@/types/sketch'
import { buildWallSweepGeometry } from '@/geometry/wallSweep'

type CadRebuildResult = {
  ok: boolean
  fallbackUsed: boolean
  errorMessage?: string
}

let cachedStepBlob: Blob | null = null
let cachedStepKey: string | null = null

function buildStepCacheKey(controls: SketchControls, zProfile: WallZProfile): string {
  return JSON.stringify({ controls, zProfile })
}

function toBounds(controls: SketchControls, zProfile: WallZProfile) {
  const growBy = controls.useInnerDimensions ? zProfile.wallThickness * 2 : 0
  const width = Math.max(1, controls.scaleX + growBy)
  const depth = Math.max(1, controls.scaleY + growBy)
  const wallHeight = Math.max(20, controls.boxHeight)
  const floorThickness = Math.max(0.1, zProfile.bottomThickness)
  const height = Math.max(1, wallHeight + floorThickness)
  return { width, depth, height }
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z)
  if (!Number.isFinite(len) || len < 1e-12) return [1, 0, 0]
  return [x / len, y / len, z / len]
}

function toExportCoords(x: number, y: number, z: number): [number, number, number] {
  // App geometry is Y-up; exported CAD/slicer files are expected Z-up.
  return [x, -z, y]
}

function buildAp214StepFromMesh(
  vertices: Array<[number, number, number]>,
  triangles: Array<[number, number, number]>,
): string {
  const ts = new Date().toISOString()
  let id = 1
  const lines: string[] = []

  const nextId = () => id++

  const appProtoId = nextId()
  const appCtxId = nextId()
  const pdsRepId = nextId()
  const pdsId = nextId()
  const pdId = nextId()
  const pdfId = nextId()
  const prodId = nextId()
  const prodCtxId = nextId()

  const pointIds: number[] = []
  const vertexPointIds: number[] = []

  for (const [x, y, z] of vertices) {
    const pointId = nextId()
    pointIds.push(pointId)
    lines.push(`#${pointId} = CARTESIAN_POINT('',(${x},${y},${z}));`)

    const vertexId = nextId()
    vertexPointIds.push(vertexId)
    lines.push(`#${vertexId} = VERTEX_POINT('',#${pointId});`)
  }

  const advancedFaceIds: number[] = []

  for (const [ia, ib, ic] of triangles) {
    const a = vertices[ia]
    const b = vertices[ib]
    const c = vertices[ic]

    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const abz = b[2] - a[2]
    const acx = c[0] - a[0]
    const acy = c[1] - a[1]
    const acz = c[2] - a[2]

    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const area2 = Math.hypot(nx, ny, nz)
    if (!Number.isFinite(area2) || area2 < 1e-9) continue

    const [ux, uy, uz] = normalize(abx, aby, abz)
    const [vx, vy, vz] = normalize(nx, ny, nz)

    const edgeDefs: Array<[number, number, [number, number, number], [number, number, number]]> = [
      [ia, ib, a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]],
      [ib, ic, b, [c[0] - b[0], c[1] - b[1], c[2] - b[2]]],
      [ic, ia, c, [a[0] - c[0], a[1] - c[1], a[2] - c[2]]],
    ]

    const orientedEdgeIds: number[] = []

    for (const [from, to, , d] of edgeDefs) {
      const [dx, dy, dz] = normalize(d[0], d[1], d[2])
      const dirId = nextId()
      const vecId = nextId()
      const lineId = nextId()
      const edgeCurveId = nextId()
      const orientedEdgeId = nextId()

      lines.push(`#${dirId} = DIRECTION('',(${dx},${dy},${dz}));`)
      lines.push(`#${vecId} = VECTOR('',#${dirId},1.0);`)
      lines.push(`#${lineId} = LINE('',#${pointIds[from]},#${vecId});`)
      lines.push(`#${edgeCurveId} = EDGE_CURVE('',#${vertexPointIds[from]},#${vertexPointIds[to]},#${lineId},.T.);`)
      lines.push(`#${orientedEdgeId} = ORIENTED_EDGE('',*,*,#${edgeCurveId},.T.);`)

      orientedEdgeIds.push(orientedEdgeId)
    }

    const loopId = nextId()
    const boundId = nextId()
    const nDirId = nextId()
    const xDirId = nextId()
    const ax3Id = nextId()
    const planeId = nextId()
    const faceId = nextId()

    lines.push(`#${loopId} = EDGE_LOOP('',(${orientedEdgeIds.map((eid) => `#${eid}`).join(',')}));`)
    lines.push(`#${boundId} = FACE_OUTER_BOUND('',#${loopId},.T.);`)
    lines.push(`#${nDirId} = DIRECTION('',(${vx},${vy},${vz}));`)
    lines.push(`#${xDirId} = DIRECTION('',(${ux},${uy},${uz}));`)
    lines.push(`#${ax3Id} = AXIS2_PLACEMENT_3D('',#${pointIds[ia]},#${nDirId},#${xDirId});`)
    lines.push(`#${planeId} = PLANE('',#${ax3Id});`)
    lines.push(`#${faceId} = ADVANCED_FACE('',(#${boundId}),#${planeId},.T.);`)

    advancedFaceIds.push(faceId)
  }

  if (advancedFaceIds.length === 0) {
    throw new Error('No valid faces generated for STEP export')
  }

  const shellId = nextId()
  const sbsmId = nextId()
  const mmId = nextId()
  const radId = nextId()
  const srId = nextId()
  const uncId = nextId()
  const grcId = nextId()
  const shapeRepId = nextId()

  lines.unshift(
    `#${appProtoId} = APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtxId});`,
    `#${appCtxId} = APPLICATION_CONTEXT('core data for automotive mechanical design processes');`,
    `#${pdsRepId} = SHAPE_DEFINITION_REPRESENTATION(#${pdsId},#${shapeRepId});`,
    `#${pdsId} = PRODUCT_DEFINITION_SHAPE('','',#${pdId});`,
    `#${pdId} = PRODUCT_DEFINITION('design','',#${pdfId},#${prodCtxId});`,
    `#${pdfId} = PRODUCT_DEFINITION_FORMATION('','',#${prodId});`,
    `#${prodId} = PRODUCT('Body','Body','',(#${prodCtxId}));`,
    `#${prodCtxId} = PRODUCT_CONTEXT('',#${appCtxId},'mechanical');`,
  )

  lines.push(`#${shellId} = OPEN_SHELL('',(${advancedFaceIds.map((fid) => `#${fid}`).join(',')}));`)
  lines.push(`#${sbsmId} = SHELL_BASED_SURFACE_MODEL('',(#${shellId}));`)
  lines.push(`#${mmId} = (LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));`)
  lines.push(`#${radId} = (NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));`)
  lines.push(`#${srId} = (NAMED_UNIT(*) SOLID_ANGLE_UNIT() SI_UNIT($,.STERADIAN.));`)
  lines.push(`#${uncId} = UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#${mmId},'distance_accuracy_value','confusion accuracy');`)
  lines.push(`#${grcId} = (GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncId})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mmId},#${radId},#${srId})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'));`)
  lines.push(`#${shapeRepId} = MANIFOLD_SURFACE_SHAPE_REPRESENTATION('',(#${sbsmId}),#${grcId});`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('FreeCAD Model'),'2;1');",
    `FILE_NAME('SnartBox Shape Model','${ts}',(''),(''),'SnartBox STEP exporter 1.0','SnartBox','Unknown');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n')
}

function buildFacetedStepBox(width: number, depth: number, height: number) {
  const vertices: Array<[number, number, number]> = [
    [0, 0, 0],
    [width, 0, 0],
    [width, depth, 0],
    [0, depth, 0],
    [0, 0, height],
    [width, 0, height],
    [width, depth, height],
    [0, depth, height],
  ]

  const triangles: Array<[number, number, number]> = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 5, 1], [0, 4, 5],
    [1, 6, 2], [1, 5, 6],
    [2, 7, 3], [2, 6, 7],
    [3, 4, 0], [3, 7, 4],
  ]

  return buildAp214StepFromMesh(vertices, triangles)
}

function buildMeshTriangleData(controls: SketchControls, zProfile: WallZProfile) {
  const geometry = buildWallSweepGeometry(controls, zProfile)
  if (!geometry) return null

  try {
    const position = geometry.getAttribute('position')
    if (!position || position.count < 3) {
      return null
    }

    const vertexMap = new Map<string, number>()
    const vertices: Array<[number, number, number]> = []
    const triangles: Array<[number, number, number]> = []

    const precision = 1e-6
    const quantize = (value: number) => Math.round(value / precision) * precision

    const getVertexIndex = (x: number, y: number, z: number) => {
      const qx = quantize(x)
      const qy = quantize(y)
      const qz = quantize(z)
      const key = `${qx}|${qy}|${qz}`
      const existing = vertexMap.get(key)
      if (existing !== undefined) return existing
      const index = vertices.length
      vertices.push([qx, qy, qz])
      vertexMap.set(key, index)
      return index
    }

    for (let i = 0; i <= position.count - 3; i += 3) {
      const ax = position.getX(i)
      const ay = position.getY(i)
      const az = position.getZ(i)
      const bx = position.getX(i + 1)
      const by = position.getY(i + 1)
      const bz = position.getZ(i + 1)
      const cx = position.getX(i + 2)
      const cy = position.getY(i + 2)
      const cz = position.getZ(i + 2)

      const abx = bx - ax
      const aby = by - ay
      const abz = bz - az
      const acx = cx - ax
      const acy = cy - ay
      const acz = cz - az
      const nx = aby * acz - abz * acy
      const ny = abz * acx - abx * acz
      const nz = abx * acy - aby * acx
      const area2 = Math.hypot(nx, ny, nz)
      if (!Number.isFinite(area2) || area2 < 1e-9) {
        continue
      }

      const [eax, eay, eaz] = toExportCoords(ax, ay, az)
      const [ebx, eby, ebz] = toExportCoords(bx, by, bz)
      const [ecx, ecy, ecz] = toExportCoords(cx, cy, cz)

      const ia = getVertexIndex(eax, eay, eaz)
      const ib = getVertexIndex(ebx, eby, ebz)
      const ic = getVertexIndex(ecx, ecy, ecz)
      triangles.push([ia, ib, ic])
    }

    if (vertices.length < 3 || triangles.length < 1) {
      return null
    }

    return { vertices, triangles }
  } finally {
    geometry.dispose()
  }
}

async function buildStepBlob(controls: SketchControls, zProfile: WallZProfile): Promise<Blob> {
  const meshData = buildMeshTriangleData(controls, zProfile)
  if (!meshData) {
    throw new Error('Failed to generate wall sweep mesh for STEP export')
  }

  const stepText = buildAp214StepFromMesh(meshData.vertices, meshData.triangles)
  return new Blob([stepText], { type: 'model/step' })
}

function buildFallbackStepBlob(controls: SketchControls, zProfile: WallZProfile): Blob {
  const meshData = buildMeshTriangleData(controls, zProfile)
  if (meshData) {
    const stepText = buildAp214StepFromMesh(meshData.vertices, meshData.triangles)
    return new Blob([stepText], { type: 'model/step' })
  }

  const { width, depth, height } = toBounds(controls, zProfile)
  const text = buildFacetedStepBox(width, depth, height)
  return new Blob([text], { type: 'model/step' })
}

export async function rebuildStepCache(
  controls: SketchControls,
  zProfile: WallZProfile,
): Promise<CadRebuildResult> {
  const key = buildStepCacheKey(controls, zProfile)
  try {
    cachedStepBlob = await buildStepBlob(controls, zProfile)
    cachedStepKey = key
    return {
      ok: true,
      fallbackUsed: false,
    }
  } catch (error) {
    cachedStepBlob = buildFallbackStepBlob(controls, zProfile)
    cachedStepKey = key
    return {
      ok: true,
      fallbackUsed: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function exportStepBlob(controls: SketchControls, zProfile: WallZProfile) {
  const key = buildStepCacheKey(controls, zProfile)
  if (cachedStepBlob && cachedStepKey === key) {
    return cachedStepBlob
  }

  const result = await rebuildStepCache(controls, zProfile)
  if (cachedStepBlob) return cachedStepBlob

  if (!result.ok) {
    return buildFallbackStepBlob(controls, zProfile)
  }
  return buildFallbackStepBlob(controls, zProfile)
}
