// coqui-zoom-00
// - fork of coqui-sdf-02
// - 00
// - considers zoom level 1, min zoom
// - 01
// - ?zoom=1||2||3
// - 02
// - move between zooms
// - 03
// - grown and shrink into zoom levels, on a pow 2 scale, so that increasingly zoom /
// label number can have more time to come in and out
// - 04
// - consider how to have some overlap between zoom levels
// - 05
// - sinle label index range, additive layering
// - 06
// - tuning reveal and density
// - 07
// - refinements to glyph positioning
const regl = require('regl')({
   extensions: [
    'ANGLE_instanced_arrays',
  ],
})
const glsl = require('glslify')
const { Atlas } = require('tiny-atlas')

const searchParams = new URLSearchParams(window.location.search)
const params = {
  // ` maps onto `freezeZoom`
  // 0 - 1 values freeze on a specific zoom
  // -1 shows all zooms at once :)
  // > 1 loops through all indicies
  zoom: searchParams.has('zoom') ? parseFloat(searchParams.get('zoom')) : 2
}
console.log({params})

const colors = {
  light: [255, 243, 135].concat([255.0]),
  dark: [90, 84, 0].concat([255.0]),
}
colors.glslLight = colors.light.map(c => c/255.0)
colors.glslDark = colors.dark.map(c => c/255.0)

const pixelRatio = Math.min(2, window.devicePixelRatio)

const drawGlyphs = regl({
  attributes: {
    position: [
      -1, -1,
      -1, 1,
      1, 1,
      1, -1
    ],
    anchor: {
      buffer: regl.prop('anchor'),
      divisor: 1,
    },
    labelDim: {
      buffer: regl.prop('labelDim'),
      divisor: 1,
    },
    glyphInLabelStringIndex: {
      buffer: regl.prop('glyphInLabelStringIndex'),
      divisor: 1,
    },
    glyphInLabelStringOffset: {
      buffer: regl.prop('glyphInLabelStringOffset'),
      divisor: 1,
    },
    glyphTexOffset: {
      buffer: regl.prop('glyphTexOffset'),
      divisor: 1,
    },
    glyphTexDim: {
      buffer: regl.prop('glyphTexDim'),
      divisor: 1,
    },
    glyphRasterDim: {
      buffer: regl.prop('glyphRasterDim'),
      divisor: 1,
    },
    glyphRasterTop: {
      buffer: regl.prop('glyphRasterTop'),
      divisor: 1,
    },
    speed: {
      buffer: regl.prop('speed'),
      divisor: 1,
    },
    labelCharLengh: {
      buffer: regl.prop('labelCharLengh'),
      divisor: 1,
    },
    radiusOffset: {
      buffer: regl.prop('radiusOffset'),
      divisor: 1,
    },
    radiusRange: {
      buffer: regl.prop('radiusRange'),
      divisor: 1,
    },
    radiusRangeOffset: {
      buffer: regl.prop('radiusRangeOffset'),
      divisor: 1,
    },
    fontSize: {
      buffer: regl.prop('fontSize'),
      divisor: 1,
    },
    thetaRangeOffset: {
      buffer: regl.prop('thetaRangeOffset'),
      divisor: 1,
    },
    glyphOffsetScalar: {
      buffer: regl.prop('glyphOffsetScalar'),
      divisor: 1,
    },
    labelZoomIndexCount: {
      buffer: regl.prop('labelZoomIndexCount'),
      divisor: 1,
    }
  },
  elements: [[0, 1, 2], [0, 2, 3]],
  primitive: 'triangles',
  instances: (context, props) => {
    return props.anchor.length/2
  },
  uniforms: {
    glyphsTexture: regl.prop('glyphsTexture'),
    fillDist: 0.5,
    fillColor: colors.glslLight,
    screenDim: (context) => [context.viewportWidth, context.viewportHeight],
    aspect: (context) => context.viewportWidth/context.viewportHeight,
    pixelRatio,
    tick: ({ tick }) => tick,
    labelTexDim: (context, props) =>{
      return [props.glyphsTexture.width, props.glyphsTexture.height]
    },
    freezeZoom: params.zoom,
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    attribute vec2 anchor;
    attribute vec2 glyphTexOffset;
    attribute vec2 glyphTexDim;
    attribute vec2 glyphRasterDim;
    attribute vec2 glyphInLabelStringOffset;
    attribute vec2 labelDim;
    attribute float speed;
    attribute float fontSize;
    attribute float labelCharLengh;
    attribute vec3 radiusRangeOffset;
    attribute float glyphRasterTop;
    attribute vec3 thetaRangeOffset;
    attribute float glyphInLabelStringIndex;
    attribute vec2 glyphOffsetScalar;
    attribute vec3 labelZoomIndexCount;
    uniform float tick, aspect, pixelRatio;
    uniform vec2 screenDim;
    uniform vec2 labelTexDim;
    varying vec2 tcoord;
    varying float vNormalizedRadius;
    varying vec3 vLabelZoomIndexCount;
    
    const float PI = ${Math.PI};

    mat2 rotate2d (float _angle) {
      return mat2(
        cos(_angle), -sin(_angle),
        sin(_angle), cos(_angle)
      );
    }

    void main () {
      vLabelZoomIndexCount = labelZoomIndexCount;
      vec2 thetaRange = thetaRangeOffset.xy;
      float thetaOffset = thetaRangeOffset.z;
      vec2 radiusRange = radiusRangeOffset.xy;
      float radiusOffset = radiusRangeOffset.z;

      float rate = speed * tick;
      float normalizeRadius = mod(rate + radiusOffset, 1.0);
      vNormalizedRadius = normalizeRadius;
      float radius = mix(radiusRange.x, radiusRange.y, normalizeRadius);
      float radiusMidpoint = mix(radiusRange.x, radiusRange.y, 0.5);
      
      vec2 labelScaledFontSize = vec2(
        fontSize * pixelRatio * labelDim.x / labelDim.y * aspect,
        fontSize * pixelRatio
      );
      vec2 labelScaledScreen = labelScaledFontSize / screenDim * pixelRatio;
      vec2 glyphScale = glyphRasterDim / labelDim * labelScaledScreen;
      vec2 radialCenter = vec2(
        labelScaledScreen.x * labelCharLengh / 3.5,
        -radiusMidpoint
      );
      
      vec2 thetaScalar = vec2(thetaRange.x, thetaRange.y);
      float theta = mix(
        0., PI * 0.5,
        1.0 - smoothstep(
          thetaScalar.x, thetaScalar.y,
          (glyphInLabelStringIndex + (1.0/labelCharLengh)) * 2.0 - 1.0));
      
      theta += thetaOffset;
      vec2 thetaXYUnit = vec2(cos(theta), sin(theta)) / vec2(1.0, aspect);
      vec2 glyphOffset = thetaXYUnit * vec2(aspect, 1.0) * vec2(
        glyphRasterDim.y / labelDim.x,
        ((glyphRasterTop - glyphRasterDim.y) / labelDim.y) * normalizeRadius
      ) * glyphOffsetScalar;
      vec2 radialOffset = thetaXYUnit * radius;
      mat2 rotation = rotate2d(theta + PI * 1.5);
      float radialScale = mix(0.2, 2.0, normalizeRadius);

      vec2 uv = position * 0.5 + 0.5;
      vec2 p = uv * glyphScale * rotation * radialScale + radialOffset + glyphOffset + anchor + radialCenter;

      gl_Position = vec4(p.x, p.y, 0.0, 1.0);

      // this should be our position's within the texSize [[0, 1], [0, 1]]
      // tcoord: (texOffset + (texDim * uv)) / texSize
      vec2 flippedUv = vec2(uv.x, 1.0 - uv.y);
      tcoord = (glyphTexOffset + (glyphTexDim * flippedUv)) / labelTexDim;
    }
  `,
  frag: glsl`
    precision highp float;
    uniform sampler2D glyphsTexture;
    uniform float fillDist;
    uniform float tick;
    uniform float freezeZoom;
    uniform vec4 fillColor, haloColor;
    varying vec2 tcoord;
    varying float vNormalizedRadius;
    varying vec3 vLabelZoomIndexCount;

    const float maxZoom = 3.0;
    const vec2 zoom1Range = vec2(0.0, 1.0);
    const vec2 zoom2Range = vec2(1.0, 2.0);
    const vec2 zoom3Range = vec2(2.0, 3.0);
    const vec2 zoomOverscale = vec2(0.0, 0.3);

    #pragma glslify: random = require('glsl-random')
    #pragma glslify: getBias = require('glsl-schlick-curve/bias')

    float inRange (vec2 range, float v) {
      return step(range.x, v) * step(v, range.y);
    }

    void main () {
      float labelZoom = vLabelZoomIndexCount.x;
      float labelIndex = vLabelZoomIndexCount.y;
      float labelCount = vLabelZoomIndexCount.z;

      float rate = tick * 0.0002;
      // flip through zoom levels
      // 18
      float tweenRangeHalf = 1.0;
      float tweenRange = tweenRangeHalf * 2.0;
      // current value in this range
      float tweenValue = mod(rate, tweenRange);
      if (tweenValue > tweenRangeHalf) {
        // decent from 1 - 0
        tweenValue = tweenRange - tweenValue;
      }
      if (freezeZoom >= 0.0 && freezeZoom <= 1.0) {
        tweenValue = freezeZoom;
      }

      vec4 sample = texture2D(glyphsTexture, tcoord);
      float fill = step(fillDist, sample.a);
      vec4 baseColor = vec4(0.0);
      if (fill == 1.0) {
        baseColor = fillColor;
      }
      float radiusRange = step(0.5, vNormalizedRadius);
      vec2 opacityDirection = mix(
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        radiusRange
      );
      vec2 smoothstepRange = mix(
        vec2(0.0, 0.5),
        vec2(0.5, 1.0),
        radiusRange
      );
      float hiddenThreshold = mix(
        opacityDirection.x,
        opacityDirection.y,
        smoothstep(smoothstepRange.x, smoothstepRange.y, vNormalizedRadius)
      );
      float randomThreshold = sqrt(random(gl_FragCoord.xy));
      vec4 color = mix(
        vec4(0.0),
        baseColor,
        step(randomThreshold, hiddenThreshold)
      );

      vec2 zoom1RangeOverscaled = zoom1Range + zoomOverscale;
      vec2 zoom2RangeOverscaled = zoom2Range + zoomOverscale;
      // zoom3Range used directly
      float reveal = step(labelIndex/labelCount, getBias(tweenValue, 0.25));

      if (tweenValue < 0.0) {
        reveal = 1.0;
      }

      if (reveal < 0.5) {
        color.w = 0.0;
      }

      gl_FragColor = vec4(color.xyzw);
    }
  `,
  depth: { enable: false },
  blend: {
    enable: true,
    func: {
      src: 'src alpha',
      dst: 'one minus src alpha'
    }
  }
})

function markLabels (mark) {
  const labels = markLabelsZoom1(mark)
    .concat(markLabelsZoom2(mark))
    .concat(markLabelsZoom3(mark))
  // const labels = markLabelsZoom1(mark)
  // const labels = markLabelsZoom2(mark)
  // const labels = markLabelsZoom3(mark)

  // current & previous : [zoom, count]
  let previous = null
  let current = [1, 1]
  let previousCountAccumulated = 0

  for (let i = 0; i < labels.length; i++) {
    if (current[0] !== labels[i].labelZoomIndexCount[0]) {
      previous = current.slice()
      previousCountAccumulated += previous[1]
      current = [labels[i].labelZoomIndexCount[0], labels[i].labelZoomIndexCount[2]]
    }
    labels[i].labelZoomIndexCount[1] = previousCountAccumulated + labels[i].labelZoomIndexCount[1]
    labels[i].labelZoomIndexCount[2] = labels.length / 2.0
  }
  return labels
}

// given a screen size, return a single mark in the middle of the screen
// the font size should be proportional to the window size. the shorder side
// of the two
function markLabelsZoom1 (mark) {
  const zoom = 1
  let shorterSide = Math.min(window.innerWidth, window.innerHeight)
  let fontSize
  if (window.innerWidth < window.innerHeight) {
    fontSize = shorterSide/mark.length
  }
  else {
    fontSize = shorterSide/2.0
  }
  fontSize = Math.min(fontSize, 124)

  const baseLabel = (opts={}) => {
    const radiusOffset = 0.4
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-0.9, -0.3],
      speed: 0.005,
      fontSize,
      thetaRangeOffset: [-0.8, 1.3, opts.thetaOffset || +Math.PI/20],
      radiusRangeOffset: [0.1, 0.7, opts.radiusOffset || radiusOffset],
      glyphOffsetScalar: [1.0, 0.3],
      labelZoomIndexCount: [1, 0, 1],
      ...opts,
    }
  }
  const labels = [
    baseLabel({ radiusOffset: 0.10, thetaOffset: +Math.PI * 0.25 }),
    baseLabel({ radiusOffset: 0.51, thetaOffset: +Math.PI * 0.3 }),
  ]
  return labels
}

function dim ({ zoom, mark, maxFontSize }) {
  let fontSize, rows, cols
  if (window.innerWidth < window.innerHeight) {
    const density = zoom === 2 ? 2.0 : 0.8
    fontSize = Math.min(maxFontSize, window.innerWidth/zoom/mark.length)
    cols = zoom
    rows = Math.max(1, Math.floor(window.innerHeight / fontSize / density))
  }
  else {
    const density = zoom === 2 ? 3.0 : 2.
    fontSize = Math.min(maxFontSize, window.innerHeight/zoom/2.0)
    rows = Math.floor(window.innerHeight/fontSize/density)
    cols = Math.max(1, Math.floor(window.innerWidth / (fontSize * mark.length)))
  }
  return { rows, cols, fontSize}
}

// subdivide the space into quarters
function markLabelsZoom2 (mark) {
  const zoom = 2
  const { rows, cols, fontSize } = dim({
    zoom,
    mark,
    maxFontSize: 48,
  })

  const baseLabel = (opts={}) => {
    const radiusOffset = 0.4
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-0.2, -0.2],
      speed: 0.008,
      fontSize,
      thetaRangeOffset: [-0.8, 1.3, opts.thetaOffset || +Math.PI/20],
      radiusRangeOffset: [0.0, 0.4, opts.radiusOffset || radiusOffset],
      glyphOffsetScalar: [1.0, 0.14],
      ...opts,
    }
  }
  const labelPair = (opts={}) => {
    const thetaOffset = Math.random() * 0.4
    const tickThetaOffset = +Math.PI * thetaOffset
    const tockThetaOffset = +Math.PI * (thetaOffset + ((Math.random() < 0.5 ? 1 : -1 ) * 0.05))
    const tickRadiusOffset = Math.random()
    const tockRadiusOffset = (tickRadiusOffset + 0.5) % 1.0
    return [
      baseLabel({
        ...opts,
        thetaOffset: tickThetaOffset,
        radiusOffset: tickRadiusOffset,  
      }),
      baseLabel({
        ...opts,
        thetaOffset: tockThetaOffset,
        radiusOffset: tockRadiusOffset,  
      }),
    ]
  }

  let labelOpts = []
  const revealIndicies = []
  let labelCount = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const xGitter = Math.random() * 0.3 - 0.15;
      labelOpts.push({
        anchor: [
          x/cols * 2.0 - 1.0 + xGitter,
          y/rows * 2.0 - 1.0,
        ],
      })
      revealIndicies.push(labelCount)
      labelCount += 1
    }
  }
  for (let i = 0; i < labelOpts.length; i++) {
    const randomRevealIndex = Math.floor(Math.random() * revealIndicies.length)
    const revealIndexValue = revealIndicies[randomRevealIndex]
    labelOpts[i].labelZoomIndexCount = [zoom, revealIndexValue, labelCount]
    revealIndicies.splice(randomRevealIndex, 1)
  }

  const labels = labelOpts.map(labelOpt => labelPair(labelOpt)).flat()

  return labels
}

function markLabelsZoom3 (mark) {
  const zoom = 3
  const { rows, cols, fontSize } = dim({
    zoom,
    mark,
    maxFontSize: 12,  
  })

  const baseLabel = (opts={}) => {
    const radiusOffset = 0.4;
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-0.2, -0.2],
      speed: 0.008,
      fontSize,
      thetaRangeOffset: [-1.0, 1.0, opts.thetaOffset || +Math.PI/20],
      radiusRangeOffset: [0.0, 0.1, opts.radiusOffset || radiusOffset],
      glyphOffsetScalar: [1.0, 0.03],
      ...opts,
    }
  }

  const labelPair = (opts={}) => {
    const thetaOffset = Math.random() * 0.2
    const tickThetaOffset = +Math.PI * thetaOffset
    const tockThetaOffset = +Math.PI * (thetaOffset + ((Math.random() < 0.5 ? 1 : -1 ) * 0.05))
    const tickRadiusOffset = Math.random()
    const tockRadiusOffset = (tickRadiusOffset + 0.5) % 1.0
    const speed = 0.01 + Math.random() * 0.002 * (Math.random() < 0.5 ? 1 : -1)
    return [
      baseLabel({
        ...opts,
        thetaOffset: tickThetaOffset,
        radiusOffset: tickRadiusOffset,
        speed,
      }),
      baseLabel({
        ...opts,
        thetaOffset: tockThetaOffset,
        radiusOffset: tockRadiusOffset,  
        speed,
      }),
    ]
  }

  let labelOpts = []
  const revealIndicies = []
  let labelCount = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const xGitter = Math.random() * 0.3 - 0.15
      labelOpts.push({
        anchor: [
          x/cols * 2.0 - 1.0 + xGitter,
          y/rows * 2.0 - 1.0,
        ],
      })
      revealIndicies.push(labelCount)
      labelCount += 1
    }
  }
  for (let i = 0; i < labelOpts.length; i++) {
    const randomRevealIndex = Math.floor(Math.random() * revealIndicies.length)
    const revealIndexValue = revealIndicies[randomRevealIndex]
    labelOpts[i].labelZoomIndexCount = [zoom, revealIndexValue, labelCount]
    revealIndicies.splice(randomRevealIndex, 1)
  }

  const labels = labelOpts.map(labelOpt => labelPair(labelOpt)).flat()

  return labels
}

;(async () => {
  const font = new FontFace('Fredoka', "url('fonts/Fredoka-SemiBold.ttf')")
  await font.load()
  document.fonts.add(font)
  const mark = 'coquí'

  const atlas = new Atlas({
    fontSize: 96,
    buffer: 3,
    radius: 8,
    cutoff: 0.25,
    fontFamily: 'Fredoka',
  })

  let glyphs = makeGlyphs()

  function makeGlyphs () {
    atlas.clear()
    const labels = markLabels(mark)

    const props = atlas.prepare({
      labels,
      instances: {
        create: ({ props, size }) => {
          props.labelCharLengh = new Float32Array(size * 1)
          props.anchor = new Float32Array(size * 2)
          props.speed = new Float32Array(size * 1)
          props.thetaRangeOffset = new Float32Array(size * 3)
          props.radiusRangeOffset = new Float32Array(size * 3)
          props.fontSize = new Float32Array(size * 1)
          props.glyphOffsetScalar = new Float32Array(size * 2)
          props.labelZoomIndexCount = new Float32Array(size * 3)
        },
        onGlyph: ({ props, labelIndex, charIndex, glyphIndex }) => {
          const label = labels[labelIndex]
          props.labelCharLengh[glyphIndex * 1 + 0] = label.labelCharLengh
          props.anchor[glyphIndex * 2 + 0] = label.anchor[0]
          props.anchor[glyphIndex * 2 + 1] = label.anchor[1]
          props.speed[glyphIndex * 1 + 0] = label.speed
          props.thetaRangeOffset[glyphIndex * 3 + 0] = label.thetaRangeOffset[0]
          props.thetaRangeOffset[glyphIndex * 3 + 1] = label.thetaRangeOffset[1]
          props.thetaRangeOffset[glyphIndex * 3 + 2] = label.thetaRangeOffset[2]
          props.radiusRangeOffset[glyphIndex * 3 + 0] = label.radiusRangeOffset[0]
          props.radiusRangeOffset[glyphIndex * 3 + 1] = label.radiusRangeOffset[1]
          props.radiusRangeOffset[glyphIndex * 3 + 2] = label.radiusRangeOffset[2]
          props.fontSize[glyphIndex * 1 + 0] = label.fontSize
          props.glyphOffsetScalar[glyphIndex * 2 + 0] = label.glyphOffsetScalar[0]
          props.glyphOffsetScalar[glyphIndex * 2 + 1] = label.glyphOffsetScalar[1]
          props.labelZoomIndexCount[glyphIndex * 3 + 0] = label.labelZoomIndexCount[0]
          props.labelZoomIndexCount[glyphIndex * 3 + 1] = label.labelZoomIndexCount[1]
          props.labelZoomIndexCount[glyphIndex * 3 + 2] = label.labelZoomIndexCount[2]
        },
      }
    })
    const glyphsTexture = regl.texture(props.texture)
    props.glyphs.glyphsTexture = glyphsTexture
    return props.glyphs
  }

  window.addEventListener('resize', () => {
    glyphs = makeGlyphs()
  })

  regl.frame(() => {
    regl.clear({ color: colors.glslDark, depth: 1 })
    drawGlyphs(glyphs)
  })
})()