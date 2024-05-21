// coqui-sdf-01
// - 00
// - basic setup, single mark large in the center
// - 01
// - smattering of coqui
// - 02
// - use instancing
const regl = require('regl')({
   extensions: [
    'ANGLE_instanced_arrays',
  ],
})
const glsl = require('glslify')
const { Atlas } = require('tiny-atlas')

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
    maxRadius: {
      buffer: regl.prop('maxRadius'),
      divisor: 1,
    },
    fontSize: {
      buffer: regl.prop('fontSize'),
      divisor: 1,
    },
    letterSpacing: {
      buffer: regl.prop('letterSpacing'),
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
    attribute float maxRadius;
    attribute float glyphRasterTop;
    attribute float letterSpacing;
    attribute float glyphInLabelStringIndex;
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
      vec2 uv = position * 0.5 + 0.5;

      vec2 labelScaledFontSize = vec2(
        fontSize * pixelRatio * labelDim.x / labelDim.y * aspect,
        fontSize * pixelRatio
      );
      vec2 labelScaledScreen = labelScaledFontSize / screenDim * pixelRatio;
      vec2 glyphScale = glyphRasterDim / labelDim * labelScaledScreen;
      vec2 glyphOffset = vec2(
        glyphInLabelStringOffset.x / labelDim.x * letterSpacing * labelScaledScreen.x,
        (glyphRasterTop - glyphRasterDim.y) / labelDim.y * labelScaledScreen.y
      );

      float rate = speed * tick;
      // float rate = 0.0 * tick;
      float radius = mod(rate + radiusOffset, maxRadius);
      float normalizeRadius = radius/maxRadius;
      vNormalizedRadius = normalizeRadius;
      float radialScale = mix(0.2, 2.0, normalizeRadius);
      vec2 thetaScalar = vec2(-1.8, 1.8);
      float theta = mix(
        0.0, PI,
        1.0 - smoothstep(
          thetaScalar.x, thetaScalar.y,
          (glyphInLabelStringIndex + (1.0/labelCharLengh)) * 2.0 - 1.0));
      // float theta = 0.0;
      theta += thetaOffset;
      mat2 rotation = rotate2d(theta - PI/2.0);
      vec2 radialOffset = vec2(
        cos(theta) * radius + glyphOffset.x * 0.1 * normalizeRadius,
        sin(theta) * radius + glyphOffset.y * 0.1 * normalizeRadius
      );

      vec2 p = uv * glyphScale * rotation * radialScale + radialOffset + anchor;

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

  const fontSize = pixelRatio === 2 ? 14 : 20
  const baseLabel = (opts={}) => {
    return {
      text: mark,
      labelCharLengh: mark.length,
      anchor: [0, 0],
      speed: 0.001,
      thetaOffset: -Math.PI/20,
      radiusOffset: 0.5,
      fontSize,
      letterSpacing: 0.2,
      maxRadius: 0.12,
      ...opts,
    }
  }

  const labels = []
  const markWidth = (fontSize * mark.length * (window.innerWidth/window.innerHeight))
  const halfMarkWidth = (markWidth / 2)
  const markHeight = (fontSize * 2.5)
  const countX = window.innerWidth / markWidth
  const countY = window.innerHeight / markHeight
  for (let y = 0; y < countY; y++) {
    const xGitter = y % 2 === 0 ? 0 : (markWidth * (Math.random() * 2.0 - 1.0))
    for (let x = 0; x < countX; x++) {
      const anchor = [
        ((xGitter + halfMarkWidth + (x * markWidth)) / window.innerWidth) * 2.0 -1.0,
        ((y * markHeight / window.innerHeight) * 2.0 - 1.0)
      ]
      const tick = {
        radiusOffset: Math.random(),
        thetaOffset: Math.PI/6 * (Math.random() * 2.0 -1.0),
      }
      const tock = {
        radiusOffset: (tick.radiusOffset + 0.8) % 1.0,
        thetaOffset: tick.thetaOffset + Math.PI/20,
      }
      labels.push(baseLabel({
        ...tick,
        anchor,
      }))
      labels.push(baseLabel({
        ...tock,
        anchor,
      }))
    }
  }

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
          props.radiusOffset = new Float32Array(size * 1)
          props.fontSize = new Float32Array(size * 1)
          props.letterSpacing = new Float32Array(size * 1)
          props.maxRadius = new Float32Array(size * 1)
        },
        onGlyph: ({ props, labelIndex, charIndex, glyphIndex }) => {
          const label = labels[labelIndex]
          props.labelCharLengh[glyphIndex * 1 + 0] = label.labelCharLengh
          props.anchor[glyphIndex * 2 + 0] = label.anchor[0]
          props.anchor[glyphIndex * 2 + 1] = label.anchor[1]
          props.speed[glyphIndex * 1 + 0] = label.speed
          props.thetaOffset[glyphIndex * 1 + 0] = label.thetaOffset
          props.radiusOffset[glyphIndex * 1 + 0] = label.radiusOffset
          props.fontSize[glyphIndex * 1 + 0] = label.fontSize
          props.letterSpacing[glyphIndex * 1 + 0] = label.letterSpacing
          props.maxRadius[glyphIndex * 1 + 0] = label.maxRadius
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