/*
 * Copyright (c) 2025-2026 Yunyun (Wang Yaoze)
 * Licensed under the Apache License, Version 2.0.
 * See the LICENSE file in this repository for the full text.
 * Source: https://github.com/NomenID/plugin-totp-qr
 * Project: https://nomenid.org/w/plugin-totp-qr
 */

(function () {
  'use strict'

  var ALIGNMENT = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50]
  }

  // [每块纠错码字数, [[块数, 每块数据码字数], ...]]，纠错级别 M
  var BLOCKS = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]]
  }

  var MAX_VERSION = 10

  var EXP = new Array(512)
  var LOG = new Array(256)

  ;(function () {
    var x = 1
    for (var i = 0; i < 255; i++) {
      EXP[i] = x
      LOG[x] = i
      x <<= 1
      if (x & 0x100) x ^= 0x11d
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]
  })()

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
  }

  function rsRemainder(data, degree) {
    var gen = [1]
    for (var i = 0; i < degree; i++) {
      var next = new Array(gen.length + 1).fill(0)
      for (var j = 0; j < gen.length; j++) {
        next[j] ^= gen[j]
        next[j + 1] ^= gfMul(gen[j], EXP[i])
      }
      gen = next
    }

    var rem = new Array(degree).fill(0)
    for (var k = 0; k < data.length; k++) {
      var factor = data[k] ^ rem[0]
      rem.shift()
      rem.push(0)
      for (var m = 0; m < degree; m++) rem[m] ^= gfMul(gen[m + 1], factor)
    }
    return rem
  }

  function dataCodewords(version) {
    return BLOCKS[version][1].reduce(function (sum, group) {
      return sum + group[0] * group[1]
    }, 0)
  }

  function pickVersion(byteLength) {
    for (var version = 1; version <= MAX_VERSION; version++) {
      var countBits = version <= 9 ? 8 : 16
      if (4 + countBits + byteLength * 8 <= dataCodewords(version) * 8) return version
    }
    throw new Error('Data too long for a QR code')
  }

  function buildCodewords(bytes, version) {
    var bits = []
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
    }

    push(0b0100, 4)
    push(bytes.length, version <= 9 ? 8 : 16)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8)

    var capacityBits = dataCodewords(version) * 8
    push(0, Math.min(4, capacityBits - bits.length))
    while (bits.length % 8 !== 0) bits.push(0)

    var data = []
    for (var j = 0; j < bits.length; j += 8) {
      var byte = 0
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[j + k]
      data.push(byte)
    }
    for (var pad = 0xec; data.length < capacityBits / 8; pad ^= 0xec ^ 0x11) data.push(pad)

    var ecPerBlock = BLOCKS[version][0]
    var groups = BLOCKS[version][1]
    var dataBlocks = []
    var ecBlocks = []
    var offset = 0
    for (var g = 0; g < groups.length; g++) {
      for (var n = 0; n < groups[g][0]; n++) {
        var block = data.slice(offset, offset + groups[g][1])
        offset += groups[g][1]
        dataBlocks.push(block)
        ecBlocks.push(rsRemainder(block, ecPerBlock))
      }
    }

    var result = []
    var maxData = Math.max.apply(null, dataBlocks.map(function (b) { return b.length }))
    for (var p = 0; p < maxData; p++) {
      for (var q = 0; q < dataBlocks.length; q++) {
        if (p < dataBlocks[q].length) result.push(dataBlocks[q][p])
      }
    }
    for (var r = 0; r < ecPerBlock; r++) {
      for (var s = 0; s < ecBlocks.length; s++) result.push(ecBlocks[s][r])
    }
    return result
  }

  function formatBits(mask) {
    var data = mask // 纠错级别 M 的两位是 00
    var rem = data
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    return ((data << 10) | rem) ^ 0x5412
  }

  function versionBits(version) {
    var rem = version
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    return (version << 12) | rem
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0
      case 1: return y % 2 === 0
      case 2: return x % 3 === 0
      case 3: return (x + y) % 3 === 0
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    }
  }

  function drawFormat(modules, isFunction, size, mask) {
    var bits = formatBits(mask)
    function bit(i) { return ((bits >>> i) & 1) === 1 }
    function put(x, y, value) {
      modules[y][x] = value
      isFunction[y][x] = true
    }

    for (var i = 0; i <= 5; i++) put(8, i, bit(i))
    put(8, 7, bit(6))
    put(8, 8, bit(7))
    put(7, 8, bit(8))
    for (var j = 9; j < 15; j++) put(14 - j, 8, bit(j))

    for (var k = 0; k < 8; k++) put(size - 1 - k, 8, bit(k))
    for (var m = 8; m < 15; m++) put(8, size - 15 + m, bit(m))
    put(8, size - 8, true)
  }

  function baseMatrix(version) {
    var size = version * 4 + 17
    var modules = []
    var isFunction = []
    for (var i = 0; i < size; i++) {
      modules.push(new Array(size).fill(false))
      isFunction.push(new Array(size).fill(false))
    }
    function set(x, y, dark) {
      modules[y][x] = dark
      isFunction[y][x] = true
    }

    for (var t = 0; t < size; t++) {
      set(6, t, t % 2 === 0)
      set(t, 6, t % 2 === 0)
    }

    var finders = [[3, 3], [size - 4, 3], [3, size - 4]]
    for (var f = 0; f < finders.length; f++) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var x = finders[f][0] + dx
          var y = finders[f][1] + dy
          if (x < 0 || x >= size || y < 0 || y >= size) continue
          var dist = Math.max(Math.abs(dx), Math.abs(dy))
          set(x, y, dist !== 2 && dist !== 4)
        }
      }
    }

    var align = ALIGNMENT[version]
    for (var a = 0; a < align.length; a++) {
      for (var b = 0; b < align.length; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === align.length - 1) || (a === align.length - 1 && b === 0)) continue
        for (var ay = -2; ay <= 2; ay++) {
          for (var ax = -2; ax <= 2; ax++) {
            set(align[a] + ax, align[b] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1)
          }
        }
      }
    }

    if (version >= 7) {
      var vbits = versionBits(version)
      for (var v = 0; v < 18; v++) {
        var dark = ((vbits >>> v) & 1) === 1
        var va = size - 11 + (v % 3)
        var vb = Math.floor(v / 3)
        set(va, vb, dark)
        set(vb, va, dark)
      }
    }

    return { size: size, modules: modules, isFunction: isFunction }
  }

  function placeData(modules, isFunction, size, codewords) {
    var index = 0
    var total = codewords.length * 8
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j
          var upward = ((right + 1) & 2) === 0
          var y = upward ? size - 1 - vert : vert
          if (!isFunction[y][x] && index < total) {
            modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1
            index++
          }
        }
      }
    }
  }

  function applyMask(modules, isFunction, size, mask) {
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x]
      }
    }
  }

  function penaltyScore(modules, size) {
    var score = 0

    function lineScore(get) {
      var total = 0
      var run = 1
      for (var i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) {
          run++
        } else {
          if (run >= 5) total += 3 + run - 5
          run = 1
        }
      }
      if (run >= 5) total += 3 + run - 5

      var patternA = [true, false, true, true, true, false, true, false, false, false, false]
      var patternB = [false, false, false, false, true, false, true, true, true, false, true]
      var padded = new Array(size + 8).fill(false)
      for (var j = 0; j < size; j++) padded[j + 4] = get(j)
      for (var k = 0; k <= padded.length - 11; k++) {
        var a = true
        var b = true
        for (var m = 0; m < 11; m++) {
          if (padded[k + m] !== patternA[m]) a = false
          if (padded[k + m] !== patternB[m]) b = false
        }
        if (a) total += 40
        if (b) total += 40
      }
      return total
    }

    for (var y = 0; y < size; y++) {
      score += lineScore((function (row) { return function (x) { return modules[row][x] } })(y))
    }
    for (var x = 0; x < size; x++) {
      score += lineScore((function (col) { return function (y) { return modules[y][col] } })(x))
    }

    for (var by = 0; by < size - 1; by++) {
      for (var bx = 0; bx < size - 1; bx++) {
        var color = modules[by][bx]
        if (modules[by][bx + 1] === color && modules[by + 1][bx] === color && modules[by + 1][bx + 1] === color) {
          score += 3
        }
      }
    }

    var dark = 0
    for (var dy = 0; dy < size; dy++) {
      for (var dx = 0; dx < size; dx++) if (modules[dy][dx]) dark++
    }
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10

    return score
  }

  function matrix(text, options) {
    options = options || {}
    var bytes = new TextEncoder().encode(text)
    var version = options.version || pickVersion(bytes.length)
    if (!BLOCKS[version]) throw new Error('Unsupported QR version')
    var codewords = buildCodewords(bytes, version)

    function build(mask) {
      var base = baseMatrix(version)
      drawFormat(base.modules, base.isFunction, base.size, 0)
      placeData(base.modules, base.isFunction, base.size, codewords)
      applyMask(base.modules, base.isFunction, base.size, mask)
      drawFormat(base.modules, base.isFunction, base.size, mask)
      return base
    }

    if (typeof options.mask === 'number' && options.mask >= 0) {
      var forced = build(options.mask)
      return { version: version, size: forced.size, modules: forced.modules }
    }

    var best = null
    for (var mask = 0; mask < 8; mask++) {
      var candidate = build(mask)
      var score = penaltyScore(candidate.modules, candidate.size)
      if (!best || score < best.score) best = { score: score, size: candidate.size, modules: candidate.modules }
    }
    return { version: version, size: best.size, modules: best.modules }
  }

  window.NomenQr = {
    matrix: matrix,
    // 返回 SVG 路径给设置页画：viewBox 是 0 0 (size+8) (size+8)，路径已含 4 格静区
    render: function (text) {
      var result = matrix(text)
      var path = []
      for (var y = 0; y < result.size; y++) {
        for (var x = 0; x < result.size; x++) {
          if (result.modules[y][x]) path.push('M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z')
        }
      }
      return { size: result.size, path: path.join('') }
    }
  }
})()
