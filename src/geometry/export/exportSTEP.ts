import ocMainJS from 'opencascade.js/dist/opencascade.js'
import ocCoreWasm from 'opencascade.js/dist/opencascade.core.wasm?url'
import TKMathWasm from 'opencascade.js/dist/module.TKMath.wasm?url'
import TKG2dWasm from 'opencascade.js/dist/module.TKG2d.wasm?url'
import TKG3dWasm from 'opencascade.js/dist/module.TKG3d.wasm?url'
import TKServiceWasm from 'opencascade.js/dist/module.TKService.wasm?url'
import TKGeomBaseWasm from 'opencascade.js/dist/module.TKGeomBase.wasm?url'
import TKBRepWasm from 'opencascade.js/dist/module.TKBRep.wasm?url'
import TKGeomAlgoWasm from 'opencascade.js/dist/module.TKGeomAlgo.wasm?url'
import TKTopAlgoWasm from 'opencascade.js/dist/module.TKTopAlgo.wasm?url'
import TKPrimWasm from 'opencascade.js/dist/module.TKPrim.wasm?url'
import TKXSBaseWasm from 'opencascade.js/dist/module.TKXSBase.wasm?url'
import TKSTEPBaseWasm from 'opencascade.js/dist/module.TKSTEPBase.wasm?url'
import TKSTEP209Wasm from 'opencascade.js/dist/module.TKSTEP209.wasm?url'
import TKSTEPAttrWasm from 'opencascade.js/dist/module.TKSTEPAttr.wasm?url'
import TKSTEPWasm from 'opencascade.js/dist/module.TKSTEP.wasm?url'
import type { SketchControls, WallZProfile } from '@/types/sketch'

type OpenCascadeInstance = {
  [key: string]: unknown
  loadDynamicLibrary: (
    lib: string,
    flags: {
      loadAsync: boolean
      global: boolean
      nodelete: boolean
      allowUndefined: boolean
    },
  ) => Promise<number>
  STEPControl_StepModelType: {
    STEPControl_AsIs: unknown
  }
  FS: {
    readFile: (path: string, opts?: unknown) => Uint8Array
    unlink: (path: string) => void
  }
}

let ocPromise: Promise<OpenCascadeInstance> | null = null

async function getOpenCascade() {
  if (!ocPromise) {
    ocPromise = new (ocMainJS as unknown as {
      new (settings: { locateFile: (path: string) => string }): Promise<OpenCascadeInstance>
    })({
      locateFile(path: string) {
        // Use dynamic core module as the main runtime for subsequent dylib loading.
        if (path.endsWith('.wasm')) {
          return ocCoreWasm
        }
        return path
      },
    })
      .then(async (oc) => {
        const orderedLibs = [
          TKMathWasm,
          TKG2dWasm,
          TKG3dWasm,
          TKServiceWasm,
          TKGeomBaseWasm,
          TKBRepWasm,
          TKGeomAlgoWasm,
          TKTopAlgoWasm,
          TKPrimWasm,
          TKXSBaseWasm,
          TKSTEPBaseWasm,
          TKSTEP209Wasm,
          TKSTEPAttrWasm,
          TKSTEPWasm,
        ]

        for (const lib of orderedLibs) {
          await oc.loadDynamicLibrary(lib, {
            loadAsync: true,
            global: true,
            nodelete: true,
            allowUndefined: false,
          })
        }
        return oc
      })
  }
  return ocPromise
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

function constructWithOverload<T>(oc: OpenCascadeInstance, baseName: string, args: unknown[]): T {
  const candidates = [
    baseName,
    `${baseName}_1`,
    `${baseName}_2`,
    `${baseName}_3`,
    `${baseName}_4`,
    `${baseName}_5`,
    `${baseName}_6`,
    `${baseName}_7`,
    `${baseName}_8`,
  ]

  for (const candidate of candidates) {
    const ctor = oc[candidate] as (new (...params: unknown[]) => T) | undefined
    if (!ctor) continue
    try {
      return new ctor(...args)
    } catch {
      // Try next overload.
    }
  }

  throw new Error(`No usable constructor found for ${baseName}(${args.length} args)`)
}

function constructBoxMaker(oc: OpenCascadeInstance, width: number, height: number, depth: number) {
  try {
    return constructWithOverload<{
      Shape?: () => { delete?: () => void }
      Solid?: () => { delete?: () => void }
      delete?: () => void
    }>(oc, 'BRepPrimAPI_MakeBox', [width, height, depth])
  } catch {
    const maker = constructWithOverload<{
      Init_1?: (dx: number, dy: number, dz: number) => void
      Build?: () => void
      Shape?: () => { delete?: () => void }
      Solid?: () => { delete?: () => void }
      delete?: () => void
    }>(oc, 'BRepPrimAPI_MakeBox', [])

    if (typeof maker.Init_1 !== 'function') {
      throw new Error('BRepPrimAPI_MakeBox available, but Init_1 is missing')
    }

    maker.Init_1(width, height, depth)
    maker.Build?.()
    return maker
  }
}

function buildFacetedStepBox(width: number, depth: number, height: number) {
  const ts = new Date().toISOString()
  const p = [
    [0, 0, 0],
    [width, 0, 0],
    [width, depth, 0],
    [0, depth, 0],
    [0, 0, height],
    [width, 0, height],
    [width, depth, height],
    [0, depth, height],
  ]

  const pointIds = p.map((xyz, idx) => `#${100 + idx}=CARTESIAN_POINT('',(${xyz[0]},${xyz[1]},${xyz[2]}));`)

  const loops = [
    [100, 101, 102, 103], // bottom
    [104, 105, 106, 107], // top
    [100, 101, 105, 104], // front
    [101, 102, 106, 105], // right
    [102, 103, 107, 106], // back
    [103, 100, 104, 107], // left
  ]

  let id = 200
  const faceIds: number[] = []
  const faceLines: string[] = []
  for (const loop of loops) {
    const polyLoopId = id++
    const boundId = id++
    const faceId = id++
    faceIds.push(faceId)
    faceLines.push(`#${polyLoopId}=POLY_LOOP('',(${loop.map((n) => `#${n}`).join(',')}));`)
    faceLines.push(`#${boundId}=FACE_OUTER_BOUND('',#${polyLoopId},.T.);`)
    faceLines.push(`#${faceId}=FACE('',(#${boundId}));`)
  }

  const shellId = id++
  const brepId = id++
  const appCtxId = id++
  const prodCtxId = id++
  const prodId = id++
  const pdfId = id++
  const pdcId = id++
  const pdId = id++
  const pdsId = id++
  const unitMmId = id++
  const unitRadId = id++
  const unitSrId = id++
  const uncId = id++
  const grcId = id++
  const shapeRepId = id++
  const sdrId = id++

  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('SnartBox faceted STEP export'),'2;1');",
    `FILE_NAME('snartbox.step','${ts}',('SnartBox'),('GitHub Copilot'),'','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN_CC2'));",
    'ENDSEC;',
    'DATA;',
    ...pointIds,
    ...faceLines,
    `#${shellId}=CLOSED_SHELL('',(${faceIds.map((n) => `#${n}`).join(',')}));`,
    `#${brepId}=FACETED_BREP('SnartBox',#${shellId});`,
    `#${appCtxId}=APPLICATION_CONTEXT('automotive_design');`,
    `#${prodCtxId}=PRODUCT_CONTEXT('',#${appCtxId},'mechanical');`,
    `#${prodId}=PRODUCT('SnartBox','SnartBox','',(#${prodCtxId}));`,
    `#${pdfId}=PRODUCT_DEFINITION_FORMATION('1','',#${prodId});`,
    `#${pdcId}=PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtxId},'design');`,
    `#${pdId}=PRODUCT_DEFINITION('design','',#${pdfId},#${pdcId});`,
    `#${pdsId}=PRODUCT_DEFINITION_SHAPE('','',#${pdId});`,
    `#${unitMmId}=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));`,
    `#${unitRadId}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`,
    `#${unitSrId}=(NAMED_UNIT(*)SOLID_ANGLE_UNIT()SI_UNIT($,.STERADIAN.));`,
    `#${uncId}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${unitMmId},'distance_accuracy_value','confusion accuracy');`,
    `#${grcId}=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncId}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${unitMmId},#${unitRadId},#${unitSrId}))REPRESENTATION_CONTEXT('Context','3D'));`,
    `#${shapeRepId}=SHAPE_REPRESENTATION('',(#${brepId}),#${grcId});`,
    `#${sdrId}=SHAPE_DEFINITION_REPRESENTATION(#${pdsId},#${shapeRepId});`,
    'ENDSEC;',
    'END-ISO-10303-21;',
  ]

  return lines.join('\n')
}

export async function exportStepBlob(controls: SketchControls, zProfile: WallZProfile) {
  const { width, depth, height } = toBounds(controls, zProfile)
  try {
    const oc = await getOpenCascade()
    const filePath = '/snartbox.step'
    const boxMaker = constructBoxMaker(oc, width, height, depth)

    const shape =
      typeof boxMaker.Shape === 'function' ? boxMaker.Shape() :
      typeof boxMaker.Solid === 'function' ? boxMaker.Solid() :
      null

    if (!shape) {
      throw new Error('Failed to create OpenCascade shape from box maker')
    }

    const writer = constructWithOverload<{
      Transfer: (shape: unknown, mode: unknown, compgraph: boolean, progress: unknown) => unknown
      Write: (filename: string) => unknown
      delete?: () => void
    }>(oc, 'STEPControl_Writer', [])

    try {
      // Message_ProgressRange constructor availability varies by build, so pass null.
      writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, null as unknown as never)
      writer.Write(filePath)

      const bytes = oc.FS.readFile(filePath, { encoding: 'binary' }) as Uint8Array
      const fileData = bytes.slice().buffer
      return new Blob([fileData], { type: 'model/step' })
    } finally {
      try {
        oc.FS.unlink(filePath)
      } catch {
        // Ignore if file does not exist.
      }
      writer.delete?.()
      shape.delete?.()
      boxMaker.delete?.()
    }
  } catch {
    // Fallback if OpenCascade fails to initialize/link at runtime.
    const text = buildFacetedStepBox(width, depth, height)
    return new Blob([text], { type: 'model/step' })
  }
}
