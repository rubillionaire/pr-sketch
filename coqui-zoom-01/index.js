// coqui-zoom-00
// - fork of coqui-sdf-02
// - 00
// - considers zoom level 1, min zoom
// - 01
// - ?zoom=1||2||3
const regl = require('regl')({
   extensions: [
    'ANGLE_instanced_arrays',
  ],
})
const glsl = require('glslify')
const { Atlas } = require('tiny-atlas')

const searchParams = new URLSearchParams(window.location.search)
const params = {
  zoom: searchParams.has('zoom') ? +searchParams.get('zoom') : 3
}

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
    thetaOffset: {
      buffer: regl.prop('thetaOffset'),
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
    fontSize: {
      buffer: regl.prop('fontSize'),
      divisor: 1,
    },
    thetaRange: {
      buffer: regl.prop('thetaRange'),
      divisor: 1,
    },
    glyphOffsetScalar: {
      buffer: regl.prop('glyphOffsetScalar'),
      divisor: 1,
    },
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
    attribute float thetaOffset;
    attribute float radiusOffset;
    attribute vec2 radiusRange;
    attribute float glyphRasterTop;
    attribute vec2 thetaRange;
    attribute float glyphInLabelStringIndex;
    attribute vec2 glyphOffsetScalar;
    uniform float tick, aspect, pixelRatio;
    uniform vec2 screenDim;
    uniform vec2 labelTexDim;
    varying vec2 tcoord;
    varying float vNormalizedRadius;
    
    const float PI = ${Math.PI};

    mat2 rotate2d (float _angle) {
      return mat2(
        cos(_angle), -sin(_angle),
        sin(_angle), cos(_angle)
      );
    }

    void main () {
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
        labelScaledScreen.x * labelCharLengh / 2.0,
        -radiusMidpoint
      );
      
      float glyphIndexNormalized = glyphInLabelStringIndex/labelCharLengh;

      vec2 thetaScalar = vec2(thetaRange.x, thetaRange.y);
      float theta = mix(
        0., PI,
        1.0 - smoothstep(
          thetaScalar.x, thetaScalar.y,
          (glyphInLabelStringIndex + (1.0/labelCharLengh)) * 2.0 - 1.0));

      // float theta = mix(thetaRange.x, thetaRange.y, 1.0 - glyphIndexNormalized);
      
      theta += thetaOffset;
      vec2 thetaXYUnit = vec2(cos(theta), sin(theta));
      vec2 glyphOffset = thetaXYUnit * vec2(aspect, 1.0) * vec2(
        0.6,
        ((glyphRasterTop - glyphRasterDim.y) / labelDim.y)
      ) * glyphOffsetScalar;
      vec2 radialOffset = thetaXYUnit * radius;
      mat2 rotation = rotate2d(theta + PI * 1.4);
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
    uniform vec4 fillColor, haloColor;
    varying vec2 tcoord;
    varying float vNormalizedRadius;

    #pragma glslify: random = require('glsl-random')

    void main () {
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
  switch (params.zoom) {
    case 1: return markLabelsZoom1(mark)
    case 2: return markLabelsZoom2(mark)
    case 3: return markLabelsZoom3(mark)
  }
}

// given a screen size, return a single mark in the middle of the screen
// the font size should be proportional to the window size. the shorder side
// of the two
function markLabelsZoom1 (mark) {
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
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-1.0, 0.0],
      speed: 0.005,
      thetaOffset: +Math.PI/20,
      radiusOffset: 0.4,
      fontSize,
      thetaRange: [-3, 3],
      radiusRange: [0.1, 0.7],
      glyphOffsetScalar: [1.0, 0.3],
      ...opts,
    }
  }
  const labels = [
    baseLabel({ radiusOffset: 0.0, thetaOffset: +Math.PI * 0.25 }),
    baseLabel({ radiusOffset: 0.5, thetaOffset: +Math.PI * 0.3 }),
  ]

  return labels
}

function dim ({ zoom, mark, maxFontSize }) {
  let fontSize, rows, cols
  if (window.innerWidth < window.innerHeight) {
    const density = zoom === 2 ? 2.0 : 1.5
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
  console.log({ fontSize })
  console.log({ rows })
  console.log({ cols })
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
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-0.2, -0.2],
      speed: 0.008,
      thetaOffset: +Math.PI/20,
      radiusOffset: 0.4,
      fontSize,
      thetaRange: [-4, 4],
      radiusRange: [0.0, 0.4],
      glyphOffsetScalar: [1.0, 0.03],
      ...opts,
    }
  }
  const labelPair = (opts={}) => {
    const thetaOffset = Math.random() * 0.4
    const tickThetaOffset = +Math.PI * thetaOffset
    const tockThetaOffset = +Math.PI * (thetaOffset + ((Math.random() < 0.5 ? 1 : -1 ) * 0.07))
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

  const aspect = window.innerWidth / window.innerHeight
  let labelOpts = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      labelOpts.push({
        anchor: [
          x/cols * 2.0 - 1.0,
          y/rows * 2.0 - 1.0,
        ],
        glyphOffsetScalar: [1.0, 0.08],
      })
    }
  }

  const labels = labelOpts.map(labelOpt => labelPair(labelOpt)).flat()

  return labels
}

function markLabelsZoom3 (mark) {
  const zoom = 3
  const { rows, cols, fontSize } = dim({
    zoom,
    mark,
    maxFontSize: 48  
  })

  const baseLabel = (opts={}) => {
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [-0.2, -0.2],
      speed: 0.008,
      thetaOffset: +Math.PI/20,
      radiusOffset: 0.4,
      fontSize,
      thetaRange: [-4.0, 4.0],
      radiusRange: [0.0, 0.3],
      glyphOffsetScalar: [1.0, 0.2],
      ...opts,
    }
  }

  const labelPair = (opts={}) => {
    const thetaOffset = Math.random() * 0.4
    const tickThetaOffset = +Math.PI * thetaOffset
    const tockThetaOffset = +Math.PI * (thetaOffset + ((Math.random() < 0.5 ? 1 : -1 ) * 0.05))
    const tickRadiusOffset = Math.random()
    const tockRadiusOffset = (tickRadiusOffset + 0.5) % 1.0
    const speed = 0.008 + Math.random() * 0.002 * (Math.random() < 0.5 ? 1 : -1)
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
  const aspect = window.innerWidth / window.innerHeight
  let labelOpts = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      labelOpts.push({
        anchor: [
          x/cols * 2.0 - 1.0,
          y/rows * 2.0 - 1.0,
        ],
        glyphOffsetScalar: [1.0, 0.08],
      })
    }
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
          props.thetaOffset = new Float32Array(size * 1)
          props.thetaRange = new Float32Array(size * 2)
          props.radiusOffset = new Float32Array(size * 1)
          props.fontSize = new Float32Array(size * 1)
          props.radiusRange = new Float32Array(size * 2)
          props.glyphOffsetScalar = new Float32Array(size * 2)
        },
        onGlyph: ({ props, labelIndex, charIndex, glyphIndex }) => {
          const label = labels[labelIndex]
          props.labelCharLengh[glyphIndex * 1 + 0] = label.labelCharLengh
          props.anchor[glyphIndex * 2 + 0] = label.anchor[0]
          props.anchor[glyphIndex * 2 + 1] = label.anchor[1]
          props.speed[glyphIndex * 1 + 0] = label.speed
          props.thetaOffset[glyphIndex * 1 + 0] = label.thetaOffset
          props.thetaRange[glyphIndex * 2 + 0] = label.thetaRange[0]
          props.thetaRange[glyphIndex * 2 + 1] = label.thetaRange[1]
          props.radiusRange[glyphIndex * 2 + 0] = label.radiusRange[0]
          props.radiusRange[glyphIndex * 2 + 1] = label.radiusRange[1]
          props.radiusOffset[glyphIndex * 1 + 0] = label.radiusOffset
          props.fontSize[glyphIndex * 1 + 0] = label.fontSize
          props.glyphOffsetScalar[glyphIndex * 2 + 0] = label.glyphOffsetScalar[0]
          props.glyphOffsetScalar[glyphIndex * 2 + 1] = label.glyphOffsetScalar[1]
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