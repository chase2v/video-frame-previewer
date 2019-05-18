import {
  fetchRangeData,
  fetchMP4Root,
  extractChildren,
  toDigitFromUint8Array
} from '../utils.js'
import MediaTrack from '../js-parser/MediaTrack.js'

if (Module) {
  init()
} else {
  Module.onRuntimeInitialized = () => {
    console.log('Module inited!')
    init()
  }
}

function init() {
  initListeners()
}

function initListeners() {
  // 获取预览图按钮
  document
    .querySelector('#preview')
    .addEventListener('click', (e) => {
      e.preventDefault()
      const url = document.querySelector('#url').value
      const seconds = document.querySelector('#seconds').value

      getSampleData(url, seconds)
        .then(parseSample)
        .then(([imageRawData, width, height]) => drawImage('#canvas', width, height, imageRawData))
    })

  // 获取上传文件
  document
    .querySelector('#sprite')
    .addEventListener('click', (e) => {
      e.preventDefault()
      const file = document.querySelector('#uploader').files[0]
      const cols = document.querySelector('#cols').value || 5
      const interval = document.querySelector('#interval').value || 10

      if (file) {
        getFileData(file)
          .then(data => generateSprite(data, cols, interval))
          .then(([spriteRawData, width, height, rows]) => drawImage('#canvas1', width * cols, height * rows, spriteRawData))
      }
    })
}

function getSampleData(url = '', seconds = 0) {
  return fetchMP4Root(url)
    .then((boxes) => {
      let movieTrack
      boxes.forEach(box => {
        if (box.type === 'moov') {
          const moovBox = parseMoov(box.originData)
          const tracks = moovBox.children
            .filter(child => child.type === 'trak')
            .map(trakBox => new MediaTrack(trakBox))
          movieTrack = tracks[0]
          console.log('解析出的视频 trak box 为：', movieTrack)
        }
      })

      const { size, offset } = movieTrack.getSampleSizeAndOffset(seconds, true)
      const sps = movieTrack.getSPS()
      const pps = movieTrack.getPPS()
      const spsUint8 = Uint8Array.from(sps.NALUnit)
      const ppsUint8 = Uint8Array.from(pps.NALUnit)
      const {
        width,
        height,
      } = movieTrack.metadata;

      return fetchRangeData(url, offset, size)
        .then(res => {
          let sampleData = new Uint8Array(res)
          if (sampleData[4] === 6) {
            const seiSize = toDigitFromUint8Array(sampleData.slice(0, 4))
            const seiData = sampleData.slice(4, seiSize)
            sampleData = sampleData.slice(seiSize + 4)
          }

          const rt = new Uint8Array([
            ...[0, 0, 0, 1],
            ...spsUint8,
            ...[0, 0, 0, 1],
            ...ppsUint8,
            ...[0, 0, 0, 1],
            ...sampleData.slice(4),
          ])

          return [rt, width, height];
        })
        .catch(err => {
          console.error(err)
        })
    })
}

function parseSample([sampleData, width, height]) {
  const getPreviewData = Module.cwrap('getPreviewData', 'number',
                  ['number', 'number', 'number', 'number']);
  const offset = Module._malloc(sampleData.length)
  Module.HEAPU8.set(sampleData, offset)
  const ptr = getPreviewData(offset, sampleData.length, width, height)

  const size = Module.HEAPU32[ptr / 4]
  const frameDataPtr = Module.HEAPU32[ptr / 4 + 1]
  const imageRawData = Module.HEAPU8.subarray(frameDataPtr, frameDataPtr + size)
  return [imageRawData, width, height]
}

function drawImage(id, width, height, buffer) {
  let memCanvas = document.createElement('canvas')
  let memContext = memCanvas.getContext('2d')
  let canvas = document.querySelector(id)
  let ctx = canvas.getContext('2d')
  canvas.width = 320

  let imageData = ctx.createImageData(width, height);
  let k = 0;
  for (let i = 0; i < buffer.length; i++) {
      if (i && i % 3 === 0) {
          imageData.data[k++] = 255;
      }
      imageData.data[k++] = buffer[i];
  }
  imageData.data[k] = 255;
  memCanvas.width = width;
  memCanvas.height = height;
  canvas.height = canvas.width * height / width;
  memContext.putImageData(imageData, 0, 0, 0, 0, width, height);
  ctx.drawImage(memCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
}

function parseMoov(moovBuffer) {
  const moovInt8 = new Uint8Array(moovBuffer)
  const moovSize = Array.from(moovInt8.slice(0, 4)).map(n => ('00' + n.toString(16)).slice(-2)).join('')

  const moov = {
    type: 'moov',
    size: moovSize,
    data: moovInt8,
  }

  moov.children = extractChildren(moov)
  return moov
}

function getFileData(file) {
  if (!file) return Promise.reject('no file')

  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    fileReader.onloadend = (e) => {
      resolve(new DataView(e.target.result))
    }
    fileReader.readAsArrayBuffer(file)
  })
}

function generateSprite(data, cols = 5, interval = 10) {
  const getSpriteImage = Module.cwrap('getSpriteImage', 'number',
                  ['number', 'number', 'number', 'number']);
  const uint8Data = new Uint8Array(data.buffer)
  const offset = Module._malloc(uint8Data.length)
  Module.HEAPU8.set(uint8Data, offset)
  const ptr = getSpriteImage(offset, uint8Data.length, cols, interval)

  const spriteData = Module.HEAPU32[ptr / 4]
  const size = Module.HEAPU32[ptr / 4 + 1]
  const width = Module.HEAPU32[ptr / 4 + 2]
  const height = Module.HEAPU32[ptr / 4 + 3]
  const rows = Module.HEAPU32[ptr / 4 + 4]
  const spriteRawData = Module.HEAPU8.slice(spriteData, spriteData + size)

  Module._free(offset)
  Module._free(ptr)
  Module._free(spriteData)

  return [spriteRawData, width, height, rows]
}
