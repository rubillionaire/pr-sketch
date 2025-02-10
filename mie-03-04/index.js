// mie-03
// - 01
// - adding ocean shader texture
// - 02
// - adds vector tiles (admin lines and highways)
// - 03
// - toggle on angel_instanced_arrays and turn on city point features
// - 03-00
// - this map remains the same, but the underlying pmtiles implementation
// no longer goes from geojson -> georender -> gpu props, but instead directly
// from geojson -> gpu props
// - 03-01
// - adds labeling using latest mixmap-pmtiles internals
// - 03-02
// - parallelize the pmtiles internals
// - 03-03
// - produce labels off the main thread
// - 03-04
// - hide pmtiles internals for common patterns
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const {
  default: MixmapPMTiles,
  TileType,
  RasterShaders,
  StencilShaders,
  tilesForBbox,
  layerTileIndex,
  propsForMap,
  spreadStyleTexture,
  tileKeyToProps,
  getImagePixels,
  bboxToMesh,
  fullEarthMesh,
  GeorenderShaders,
  mixmapUniforms,
  TileSetTracker,
  WorkerBroker,
} = require('mixmap-pmtiles')
const { decode: decodePng } = require('fast-png')
const { propsIncludeLabels } = require('@rubenrodriguez/mixmap-georender/text')
const { createGlyphProps } = require('tiny-label')
const labelWorker = require('tiny-label/label-worker')
const { default: tileGrid } = require('mixmap-tile-grid')

const work = require('webworkify')
const fetchTileProps = require('mixmap-pmtiles/fetch-tile-props-worker')

const workerSpecs = {
  tileProps: {
    create: () => work(fetchTileProps),
    opts: { count: 4 },
  },
  labelProps: {
    create: () => work(labelWorker),
    opts: { count: 1 },
  },
}

const workerBrokers = {}
for (const workerType in workerSpecs) {
  const { create, opts } = workerSpecs[workerType]
  workerBrokers[workerType] = new WorkerBroker(create, opts)
}

const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
    'angle_instanced_arrays',
  ],
  attributes: {
    stencil: true,
  },
})

const colorRgb = {
  green: [97, 192, 113],
  blue: [26, 114, 187],
  white: [255, 255, 255],
}
const colorGlsl = {}
for (const color in colorRgb) {
  colorGlsl[color] = colorRgb[color].map(c => c/255)
}
const zoomRange = [8, 12]

function prViewbox () {
  const prWE = [-67.356661, -65.575714] 
  const prCenter = 18.220148006000038
  // screen height/width = prHeight/prWidth
  // screen height/width  * prWidth = prHeight
  const prHorizontal = (prWE[1] - prWE[0])
  const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
  const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]
  const viewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
  return viewbox
}

// function prViewbox () {
//   const center = {
//     lng: -66.4661875,
//     lat: 18.220148006000038,
//   }
//   const zoom = 8.5 
//   const dimensions = {
//     width: window.innerWidth,
//     height: window.innerHeight,
//   }
//   const viewbox = calculateMapViewbox(zoom, center, dimensions)

//   return [
//     viewbox.minLng,
//     viewbox.minLat,
//     viewbox.maxLng,
//     viewbox.maxLat,
//   ]
// }

const map = mix.create({
  viewbox: prViewbox(),
  backgroundColor: [0.5, 0.5, 0.5, 1.0],
  clear: {
    color: [0.5, 0.5, 0.5, 1.0],
    depth: 1,
    stencil: 0,
  },
})

function addElevation ({ zindex }) {
  const { raster } = RasterShaders(map)
  const elevation = {
    ...raster,
    uniforms: {
      ...raster.uniforms,
      maxElevation: 1016.1,
      dotColor: colorGlsl.green,
      backgroundColor: colorGlsl.white,
      zindex,
      zoomRange,
    },
    vert: `
      precision highp float;

      attribute vec2 position;
      attribute vec2 tcoord;
      uniform vec4 viewbox;
      uniform vec2 offset;
      uniform float aspect, zindex;
      varying vec2 vtcoord;
      varying vec2 vpos;

      void main () {
        vec2 p = position + offset;
        vtcoord = tcoord;
        vpos = position;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(1.0 + zindex),
          1.0
        );
      }
    `,
    frag: `
      precision highp float;

      uniform sampler2D raster;
      uniform float maxElevation, zoom;
      uniform vec2 texelSize, zoomRange;
      uniform vec3 dotColor;
      uniform vec3 backgroundColor;

      varying vec2 vtcoord;
      varying vec2 vpos;

      float circle ( vec2 _st, float _radius ) {
        vec2 pos = vec2( 0.5 ) - _st;
        return smoothstep( 1.0 - _radius, 1.0 - _radius + _radius * 0.2, 1.-dot( pos, pos ) * 3.14 );
      }

      vec2 tileSpace ( in vec2 _st, in vec2 numberOfTiles ) {
        _st *= numberOfTiles;
        _st = fract( _st );
        return _st;
      }

      vec2 tileSpaceCenter(in vec2 _st, in vec2 numberOfTiles) {
        _st *= numberOfTiles;
        return (floor(_st) + 0.5) / numberOfTiles;
      }

      float texelToElevation (vec3 texel) {
        return -10000.0 + ((texel.r * 256.0 * 256.0 * 256.0 + texel.g * 256.0 * 256.0 + texel.b * 256.0) * 0.1);
      }

      void main () {
        vec4 sample = texture2D(raster, vtcoord);
        if (sample.a < 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float tileDim = mix(80.0, 800.0, z);
        vec2 tileSize = vec2(tileDim);
        vec2 origin = tileSpaceCenter(vtcoord, tileSize);
        vec4 originSample = texture2D(raster, origin);
        vec2 tiled = tileSpace(vpos, tileSize);
        float elevation = texelToElevation(originSample.xyz);
        float normElevation = clamp(elevation/maxElevation, 0.0, 1.0);
        float inCircle = circle(
          tiled,
          mix(0.2, 0.7, normElevation)
        );
        // float opacity = mix(0., 1., inCircle);
        vec3 color = mix(backgroundColor, dotColor, inCircle);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  }
  new MixmapPMTiles(map, {
    source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/terrain-dem-v1-clipped-pr.pmtiles',
    // source: 'http://localhost:9966/pmtiles/terrain-dem-v1-clipped-pr.pmtiles',
    tileType: TileType.Png,
    shaders: {
      elevation,
    },
  })
}

const commonWater = {
  periodRange: [0.01, 0.0014],
}

function addWaterBg ({ zindex }) {
  const { positions, cells } = fullEarthMesh()
  // const { positions, cells } = bboxToMesh(prViewbox())
  const draw = map.createDraw({
    attributes: {
      position: positions,
    },
    elements: cells,
    uniforms: {
      zindex,
      colorBg: colorGlsl.white,
      colorFg: colorGlsl.blue,
      zoomRange,
      periodRange: commonWater.periodRange,
    },
    frag: `
      precision highp float;
      uniform vec3 colorBg, colorFg;
      uniform vec2 zoomRange, periodRange;
      uniform float zoom;
      varying vec2 vpos;
      void main () {
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float period = mix(periodRange.x, periodRange.y, z);
        float frequency = period/2.0;
        float isFg = mod(vpos.y, period);
        vec3 color = mix(
          colorFg,
          colorBg,
          step(isFg, frequency)
        );
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
  })
  draw.props.push({})
}

function addShoreBuffer ({ zindex }) {
  const { raster } = RasterShaders(map)
  const taper = {
    ...raster,
    uniforms: {
      ...raster.uniforms,
      colorBg: colorGlsl.white,
      colorFg: colorGlsl.blue,
      zindex,
      zoomRange,
      periodRange: commonWater.periodRange,
    },
    frag: `
      precision highp float;

      uniform sampler2D raster;
      uniform float zoom;
      uniform vec2 zoomRange, periodRange;
      uniform vec3 colorBg, colorFg;

      varying vec2 vtcoord;
      varying vec2 vpos;

      void main () {
        vec4 sample = texture2D(raster, vtcoord);
        if (sample.a < 1.0 || sample.x < 0.001) {
          discard;
          return;
        }
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float period = mix(periodRange.x, periodRange.y, z);
        float frequencyDivosor = mix(8.0, 2.0, sample.x);
        float frequency = period/frequencyDivosor;
        float isFg = mod(vpos.y, period);
        vec3 color = mix(
          colorFg,
          colorBg,
          step(isFg, frequency)
        );
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
  }
  new MixmapPMTiles(map, {
    source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/pr-shore-buffered.pmtiles',
    // source: 'http://localhost:9966/pmtiles/pr-shore-buffered.pmtiles',
    tileType: TileType.Png,
    shaders: {
      taper,
    },
  })
}

function addMvt () {
  resl({
    manifest: {
      style: {
        type: 'binary',
        src: './style-textures/pr-mie.png',
        parser: (data) => {
          return decodePng(data)
        },
      },
      labels: {
        type: 'text',
        parser: JSON.parse,
        src: './style-textures/pr-mie.json',
      }
    },
    onDone: ready,
  })
  function ready ({ style, labels }) {
    const shaders = GeorenderShaders(map)
    labels.shader = shaders.label
    labels.update = {
      labelFeatureTypes: ['point'],
    }
    new MixmapPMTiles(map, {
      source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/pr-mvt.pmtiles',
      // source: 'http://localhost:9966/pmtiles/pr-mie.mvt.pmtiles',
      tileType: TileType.Mvt,
      style,
      labels,
      shaders,
    })
  }
}

function addMvtModularly () {
  resl({
    manifest: {
      style: {
        type: 'binary',
        src: './style-textures/pr-mie.png',
        parser: (data) => {
          return decodePng(data)
        },
      },
      labelOpts: {
        type: 'text',
        parser: JSON.parse,
        src: './style-textures/pr-mie.json',
      }
    },
    onDone: ready,
  })
  async function ready ({ style, labelOpts }) {
    // mixmap-pmtiles-inputs : start
    // - this includes `style` & `labelOpts`
    const draws = {}
    const shaders = GeorenderShaders(map)

    // georender-shader-draw-key : [georender-prepare-prop-keys]
    const spreads = {
      areas: ['areaP', 'areaT'],
      areaBorders: ['areaBorderP', 'areaBorderT'],
      lineStroke: ['lineP', 'lineT'],
      lineFill: ['lineP', 'lineT'],
      points: ['pointP', 'pointT'],
    }
    const georenderShaders = GeorenderShaders(map)
    const stencilShaders = StencilShaders(map)

    // created draws
    for (const drawKey in spreads) {
      const shader = georenderShaders[drawKey]
      delete shader.pickFrag
      draws[drawKey] = map.regl({
        ...shader,
        ...stencilShaders.tileStencilHonor,
        uniforms: {
          ...shader.uniforms,
          ...mixmapUniforms(map),
        }
      })
    }
    draws.stencil = {
      reset: map.regl(stencilShaders.tileStencilReset),
      mark: map.regl(stencilShaders.tileStencilMark),
    }

    draws.label = labelOpts.fontFamily.map(() => map.regl({
      ...georenderShaders.label,
      uniforms: {
        ...georenderShaders.label.uniforms,
        ...mixmapUniforms(map),
      }
    }))
    // mixmap-pmtiles-inputs : end

    // mixmap-pmtiles-internals : start
    // init within a worker, `update` per tile set
    workerBrokers.labelProps.postMessage({
      type: 'initialize',
      options: labelOpts,
    })

    const tileSetTracker = new TileSetTracker()

    // tileKey : { tileBbox, tileProps }
    const tileKeyPropsMap = new Map()
    map.on('draw:start', () => {
      drawVectorTiles(map, tileKeyPropsMap, draws, spreads, labelOpts, styleTexture)
    })
    map.on('draw:end', () => {
      if (!tileSetTracker.isLoaded()) return
      if (tileSetTracker.isLoaded()) {
        drawLabels(map, draws, labelProps)
      }
    })
    const stylePixels = style.data
    const imageSize = [style.width, style.height]
    const styleTexture = map.regl.texture(style)
    const labelUpdateOpts = {
      style: {
        data: stylePixels,
        width: style.width,
        height: style.height,
        labelFontFamily: labelOpts.fontFamily,
      },
      labelFeatureTypes: ['point'],
    }

    workerBrokers.tileProps.addEventListener('message', (msg) => {
      const { tileBbox, tileKey, tileProps } = msg.detail
      tileSetTracker.setKeyLoaded(tileKey)
      const processLabels = tileSetTracker.isLoaded()

      if (tileProps === null && processLabels) {
        // console.log('tile-props:null', tileKey)
        getLabelProps(map, tileKeyPropsMap, labelUpdateOpts)
        // drawLabels(map, draw, tileKeyPropsMap, labels, labelUpdateOpts)
        return
      }
      else if (tileProps === null) {
        return
      }
      if (tileProps?.texture) {
        tileProps.texture = map.regl.texture(tileProps.texture)
      }
      else {
        // if we are dealing with georender props, we want to
        // spread our style texture within
        spreadStyleTexture(styleTexture, tileProps)
      }
      tileKeyPropsMap.set(tileKey, { tileBbox, tileProps })
      map.draw()
      if (processLabels) {
        getLabelProps(map, tileKeyPropsMap, labelUpdateOpts)
        // drawLabels(map, draw, tileKeyPropsMap, labels, labelUpdateOpts)
      }
    })

    let labelProps
    workerBrokers.labelProps.addEventListener('message', (msg) => {
      if (!tileSetTracker.isLoaded()) return
      if (msg.detail.type !== 'update') return
      labelProps = msg.detail.labelProps
      map.draw()
    })

    map.addLayer({
      viewbox: (bbox, zoom, cb) => {
        const tiles = tilesForBbox(bbox, zoom)
        const layerTiles = layerTileIndex(tiles)
        const { keyAdded } = tileSetTracker.setKeysQueued(Object.keys(layerTiles))
        // our viewbox changed, but tile set did not
        // we should re-compute label positions
        if (!keyAdded && tileSetTracker.isLoaded()) {
          getLabelProps(map, tileKeyPropsMap, labelUpdateOpts)
        }
        cb(null, layerTiles)
      },
      add: async (tileKey, tileBbox) => {
        const mapProps = propsForMap(map)
        const workerMessage = {
          mapProps,
          source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/pr-mvt.pmtiles',
          // source: 'http://localhost:9966/pmtiles/pr-mie.mvt.pmtiles',
          tileType: TileType.Mvt,
          tileKey,
          tileBbox,
          prepare: {
            stylePixels,
            imageSize,
            // label: labelOpts,
          },
        }
        const workerTransfer = []
        workerBrokers.tileProps.postMessage(workerMessage, workerTransfer, tileKey)
      },
      remove: (tileKey, tileBbox) => {
        tileSetTracker.remove(tileKey)
        tileKeyPropsMap.delete(tileKey)
      },
    })
    // mixmap-pmtiles-internals : end
  }

  function getLabelProps (map, tileKeyPropsMap, labelUpdateOpts) {
    const georenderPropsForLabels = []
    for (const [tileKey, { tileProps }] of tileKeyPropsMap) {
      const clone = {}
      for (const geomType in tileProps) {
        clone[geomType] = {}
        for (const propType in tileProps[geomType]) {
          if (typeof tileProps[geomType][propType] !== 'function') {
            clone[geomType][propType] = tileProps[geomType][propType]
          }
        }
      }
      georenderPropsForLabels.push(clone)
    }
    workerBrokers.labelProps.postMessage({
      type: 'update',
      options: [
        georenderPropsForLabels,
        propsForMap(map),
        labelUpdateOpts,
      ]
    })
  }

  // context provides:
  // - labels (tiny-label instance)
  // - labelUpdateOpts (tiny-label.update options)
  // function drawLabels (map, draw, tileKeyPropsMap, labels, labelUpdateOpts) {
  function spreadLabelProps (map, draws, labelProps) {
    // const georenderPropsForLabels = []
    // for (const [tileKey, { tileProps }] of tileKeyPropsMap) {
    //   georenderPropsForLabels.push(tileProps)
    // }
    // // console.log('render-labels:start', tileKeyPropsMap.size)
    // const t0 = performance.now()
    // const labelProps = labels.update(georenderPropsForLabels, propsForMap(map), labelUpdateOpts)
    // const t1 = performance.now()
    // console.log({labelProps})
    // // back on main thread
    createGlyphProps(labelProps, map)  
    // const t2 = performance.now()
    // for (const mapProps of map._props()) {
      for (let i = 0; i < labelProps.glyphs.length; i++) {
        const glyphProps = []
        for (let j = 0; j < labelProps.glyphs[i].length; j++) {
          glyphProps.push({
            ...labelProps.glyphs[i][j],
            // ...mapProps,
          })
        }
        draws.label[i].props = glyphProps
      }
    // }
    // const t3 = performance.now()
    // console.log('render-labels:end', t1-t0, t2-t1, t3-t2)
  }

  function drawLabels (map, draws, labelProps) {
    if (!labelProps) return
    createGlyphProps(labelProps, map)
    for (let i = 0; i < labelProps.glyphs.length; i++) {
      draws.label[i](labelProps.glyphs[i])
    }
  }

  function drawVectorTiles (map, tileKeyPropsMap, draws, spread, styleTexture) {
    // console.log('draw-vector-tiles', tileKeyPropsMap.size)
    // TODO write a common `drawRasterTile` setup as well
    for (const mapProps of map._props()) {
      const tileResetProps = {
        ...mapProps,
        ...fullEarthMesh(),
      }
      for (const [tileKey, { tileBbox, tileProps }] of tileKeyPropsMap) {
        if (!tileProps) continue
        const tileMarkProps = {
          ...mapProps,
          ...bboxToMesh(tileBbox),
        }
        draws.stencil.reset(tileResetProps)
        draws.stencil.mark(tileMarkProps)
        for (const drawKey in spread) {
          for (const tilePropKey of spread[drawKey]) {
            if (!draws[drawKey]) continue
            if (!tileProps[tilePropKey]) continue
            draws[drawKey]({
              ...mapProps,
              ...tileProps[tilePropKey],
            })
          }
        }
      }
    }
  }
}


addWaterBg({ zindex: 1 })
// tileGrid(map, {
//   zindex: 2,
//   color: [0,0,0,1],
//   label: false,
//   // label: {
//   //   zindex: 51,
//   //   fontSize: 14,
//   //   fillColor: [1,1,1,1],
//   //   strokeColor: [0,0,0,1],
//   // },
// })
addShoreBuffer({ zindex: 20 })
addElevation({ zindex: 30 })
addMvt()
// addMvtModularly()

window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(20,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    map.setZoom(map.getZoom()-1)
  }
  console.log('zoom', map.getZoom())
})
window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))

/**
 * Calculates the map viewbox based on zoom level, center point, and dimensions
 * @param {number} zoom - Zoom level (typically 0-20, where 0 is fully zoomed out)
 * @param {Object} center - Center point coordinates
 * @param {number} center.lng - Longitude of center point
 * @param {number} center.lat - Latitude of center point
 * @param {Object} dimensions - Map dimensions in pixels
 * @param {number} dimensions.width - Width of map in pixels
 * @param {number} dimensions.height - Height of map in pixels
 * @returns {Object} Viewbox coordinates (minLng, minLat, maxLng, maxLat)
 */
function calculateMapViewbox(zoom, center, dimensions) {
  // Constants for Web Mercator projection
  const EARTH_CIRCUMFERENCE = 40075016.686; // in meters
  const METERS_PER_PIXEL = EARTH_CIRCUMFERENCE / Math.pow(2, zoom + 8);

  // Calculate the ground resolution at the center latitude
  const groundResolution = METERS_PER_PIXEL * Math.cos(center.lat * Math.PI / 180);

  // Calculate aspect ratio
  const aspectRatio = dimensions.width / dimensions.height;
  
  // Use the larger dimension to determine the base scale
  const baseDistance = Math.max(dimensions.width, dimensions.height) / 2;
  
  // Calculate distances accounting for aspect ratio
  const distanceX = aspectRatio >= 1 
    ? baseDistance * groundResolution 
    : (baseDistance * aspectRatio) * groundResolution;
  const distanceY = aspectRatio >= 1 
    ? (baseDistance / aspectRatio) * groundResolution 
    : baseDistance * groundResolution;

  // Convert distances to degrees
  const degreesPerMeterLng = 360 / (Math.cos(center.lat * Math.PI / 180) * EARTH_CIRCUMFERENCE);
  const degreesPerMeterLat = 360 / EARTH_CIRCUMFERENCE;

  const deltaLng = distanceX * degreesPerMeterLng;
  const deltaLat = distanceY * degreesPerMeterLat;

  // Calculate the viewbox coordinates
  const viewbox = {
    minLng: center.lng - deltaLng,
    maxLng: center.lng + deltaLng,
    minLat: center.lat - deltaLat,
    maxLat: center.lat + deltaLat
  };

  // Ensure longitude values are within -180 to 180 range
  viewbox.minLng = ((viewbox.minLng + 180) % 360) - 180;
  viewbox.maxLng = ((viewbox.maxLng + 180) % 360) - 180;

  // Clamp latitude values to -90 to 90 range
  viewbox.minLat = Math.max(-90, Math.min(90, viewbox.minLat));
  viewbox.maxLat = Math.max(-90, Math.min(90, viewbox.maxLat));

  return viewbox;
}
