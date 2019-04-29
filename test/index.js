import {
  buf2hex,
  toBitsFromUint8Array,
  extractChildren,
  fetchRangeData,
} from '../src/utils.js'
import createBox from '../src/createBox.js'
import MediaTrack from '../src/MediaTrack.js'
import BasicBox from '../src/BasicBox.js'

const url = 'http://127.0.0.1:10086/test/video/movie_300.mp4'
fetchMP4Root(url, (boxes) => {
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

  const timestamp = 1
  const {size, offset} = movieTrack.getSampleSizeAndOffset(timestamp)
  const sps = movieTrack.getSPS()
  const pps = movieTrack.getPPS()
  console.log('sps 和 pps 分别为：', sps, pps)
  console.log(`${timestamp}s 时的 sample 大小和偏移量为：`, size, offset)
  fetchRangeData(url, offset, size)
    .then(res => console.log(res))
})

/**
 * parse mp4 root
 * 
 * @param {string} url mp4 url
 * @param {function} cb 回调
 */
async function fetchMP4Root(url, cb) {
  let mp4Size = await getMP4Size(url)
  let i = 0
  const boxes = []
  while (i < mp4Size) {
    let box = await getBoxSizeAndType(url, i)
    const boxData = await fetchRangeData(url, i, i + box.size - 1)
    box = createBox(box.type, boxData)
    boxes.push(box)
    i += box.size
  }
  cb && cb(boxes)
  return boxes
}

async function getMP4Size(url) {
  return new Promise((resolve) => {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function (e) {
      if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 206)) {
        const contentRange = xhr.getResponseHeader('content-range')
        resolve(contentRange.match(/\/(\d+)/)[1])
      }
    }
    xhr.open("GET", url)
    xhr.setRequestHeader('Range', 'bytes=0-1')
    xhr.responseType = "arraybuffer"
    xhr.send()
  })
}

async function getBoxSizeAndType(url, start) {
  const boxData = await fetchRangeData(url, start, 8)
  const box = new BasicBox(boxData)
  return box
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
