import {
  toDigitFromUint8Array,
  toBitsFromUint8Array,
  toTextFromUint8Array,
  decodeUnicode,
} from '../utils.js'

export default class MediaTrack {
  constructor(trakBox) {
    this.size = trakBox.size
    this.data = trakBox.data
    this.box = trakBox

    this.metadata = this._getMetadata(trakBox)
    this.metadata = {
      ...this.metadata,
      ...this._parseTKHD(this.box)
    }

    this.type = this._getType(trakBox)
    this.timeTable = this._parseSTTS(this._getSampleTableBox('stts'))
    // format time table
    this._formattedTimeTable = this._formatTimeTable(this.timeTable)
    this.syncTable = this._parseSTSS(this._getSampleTableBox('stss'))
    this.sizeTable = this._parseSTSZ(this._getSampleTableBox('stsz'))
    this.chunkOffsetBox = this._parseSTCO(this._getSampleTableBox('stco'))
    this.chunkTable = this._parseSTSC(this._getSampleTableBox('stsc'))
    this.sampleDescription = this._parseSTSD(this._getSampleTableBox('stsd'))
  }

  getSampleSizeAndOffset(timestamp, isRAP = false) {
    const arr = this._formattedTimeTable
    let i = 0
    while (timestamp * this.metadata.timescale > arr[i]) {
      i++
    }

    if (isRAP) {
      i = this.syncTable.reduce((pre, cur) => {
        if (Math.abs(cur.sampleNumber - i) < Math.abs(pre - i)) return cur.sampleNumber
        return pre
      }, this.syncTable[this.syncTable.length - 1].sampleNumber)
      i--
    }

    const chunkIndex = this.chunkTable.chunkIndexes[i].chunkIndex
    const chunkOffsetIndex = this.chunkTable.chunkIndexes[i].chunkOffsetIndex
    const chunkOffset = this.chunkOffsetBox[chunkIndex].chunkOffset

    let offset = chunkOffset
    for (let j = i - chunkOffsetIndex; j < i; j++) {
      offset += this.sizeTable.entries[j].entrySize
    }
    return {
      offset,
      size: this.sizeTable.entries[i].entrySize
    }
  }

  getSampleDataArr(seconds) {
    // 1. 通过秒数定位前一个 idr 帧 offset
    // 2. 通过秒数定位对应的帧 cur offset
    // 3. 获取中间所有帧的 offset size dts [idr, ..., cur]
    // 4. 遍历获取所有帧数据
    let ret = []
    let curIdx = 0
    while (seconds * this.metadata.timescale > this._formattedTimeTable[curIdx]) {
      curIdx++
    }
    let idrIdx
    this.syncTable.forEach(entry => {
      if (entry.sampleNumber <= curIdx) {
        idrIdx = entry.sampleNumber - 1
      }
    })
    for (let i = idrIdx; i <= curIdx; i++) {
      const {
        chunkIndex,
        chunkOffsetIndex
      } = this.chunkTable.chunkIndexes[i]
      ret.push({
        chunkIndex,
        chunkOffsetIndex,
        index: i
      })
    }
    ret = ret.map(sd => {
      const chunkOffset = this.chunkOffsetBox[sd.chunkIndex].chunkOffset
      let offset = chunkOffset
      for (let i = sd.index - sd.chunkOffsetIndex; i < sd.index; i++) {
        offset += this.sizeTable.entries[i].entrySize
      }
      return {
        ...sd,
        offset,
        size: this.sizeTable.entries[sd.index].entrySize,
        dts: this._formattedTimeTable[sd.index]
      }
    })

    return ret
  }

  // get sequence parameter sets
  getSPS() {
    return this.sampleDescription[0].avcConfigurationBox.spss[0]
  }

  // get picture parameter sets
  getPPS() {
    return this.sampleDescription[0].avcConfigurationBox.ppss[0]
  }

  _getMetadata() {
    const metadata = {}

    const mdhdBox = this.box.children
      .filter(child => child.type === 'mdia')[0].children
      .filter(child => child.type === 'mdhd')[0]
    const mdhdBoxData = mdhdBox.data

    const version = mdhdBoxData[8]

    if (version === 1) {
      metadata.creationTime = toDigitFromUint8Array(mdhdBoxData.slice(12, 20))
      metadata.modificationTime = toDigitFromUint8Array(mdhdBoxData.slice(20, 28))
      metadata.timescale = toDigitFromUint8Array(mdhdBoxData.slice(28, 32))
      metadata.duration = toDigitFromUint8Array(mdhdBoxData.slice(32, 40))
    } else {
      metadata.creationTime = toDigitFromUint8Array(mdhdBoxData.slice(12, 16))
      metadata.modificationTime = toDigitFromUint8Array(mdhdBoxData.slice(16, 20))
      metadata.timescale = toDigitFromUint8Array(mdhdBoxData.slice(20, 24))
      metadata.duration = toDigitFromUint8Array(mdhdBoxData.slice(24, 28))
    }

    // ISO-639-2/T language code
    const getLanguageCode = (version) => {
      let i = 28
      if (version === 1) {
        i = 40
      }

      const langcodes = []
      const langCodeBits = toBitsFromUint8Array(mdhdBoxData.slice(i, i + 2))
      langcodes[0] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(1, 6), 2) + 96).toString(16)).slice(-2))
      langcodes[1] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(6, 11), 2) + 96).toString(16)).slice(-2))
      langcodes[2] = decodeUnicode('\\u00' + ('00' + (parseInt(langCodeBits.slice(11, 16), 2) + 96).toString(16)).slice(-2))

      return langcodes.join('')
    }
    metadata.language = getLanguageCode(version)

    return metadata
  }

  _getType(trakBox) {
    return trakBox.children
      .filter(trakChild => trakChild.type === 'mdia')[0].children
      .filter(mdiaChild => mdiaChild.type === 'minf')[0].children
      .some(minfChild => minfChild.type === 'vmhd')
      ? 0 : 1;
  }

  _getSampleTableBox(type) {
    return this.box.children
      .filter(child => child.type === 'mdia')[0].children
      .filter(child => child.type === 'minf')[0].children
      .filter(child => child.type === 'stbl')[0].children
      .filter(child => child.type === type)[0]
  }

  _formatTimeTable(timeTableArr) {
    let time = 0
    const a = []

    timeTableArr.forEach(t => {
      for (let i = 0; i < t.sampleCount; i++) {
        time += t.sampleDelta
        a.push(time)
      }
    })

    return a
  }

  _parseTKHD(trakBox) {
    const tkhdBox = this.box.children
      .filter(child => child.type === 'tkhd')[0]
    const tkhdData = tkhdBox.data

    return {
      width: toDigitFromUint8Array(tkhdData.slice(-8, -6)),
      height: toDigitFromUint8Array(tkhdData.slice(-4, -2)),
    }
  }

  _parseSTSD(stsdBox) {
    const stsdBoxData = stsdBox.data
    const entryCount = toDigitFromUint8Array(stsdBoxData.slice(12, 16))
    const sampleEntries = []

    const parseEntry = (start) => {
      const entry = {}
      const visualSampleEntry = {}
      visualSampleEntry.size = toDigitFromUint8Array(stsdBoxData.slice(start, start + 4))
      visualSampleEntry.type = toTextFromUint8Array(stsdBoxData.slice(start + 8, start + 12))
      visualSampleEntry.dataReferenceIndex = toDigitFromUint8Array(stsdBoxData.slice(start + 18, start + 20))
      visualSampleEntry.width = toDigitFromUint8Array(stsdBoxData.slice(start + 36, start + 38))
      visualSampleEntry.height = toDigitFromUint8Array(stsdBoxData.slice(start + 38, start + 40))
      visualSampleEntry.horizresolution = 0x00480000
      visualSampleEntry.vertresolution = 0x00480000
      visualSampleEntry.frameCount = 1
      visualSampleEntry.compressorName = ''
      visualSampleEntry.depth = 0x0018
      entry.visualSampleEntry = visualSampleEntry

      // avcConfigurationBoxStart
      let acbs = 0
      stsdBoxData.forEach((byte, index) => {
        if (byte === 255 && stsdBoxData[index - 1] === 255) {
          acbs = index + 1
        }
      })
      const avcConfigurationBox = {}
      avcConfigurationBox.size = toDigitFromUint8Array(stsdBoxData.slice(acbs, acbs + 4))
      avcConfigurationBox.type = toTextFromUint8Array(stsdBoxData.slice(acbs + 4, acbs + 8))
      avcConfigurationBox.version = 1
      avcConfigurationBox.avcProfileIndication = toDigitFromUint8Array(stsdBoxData.slice(acbs + 9, acbs + 10))
      avcConfigurationBox.profileCompatibility = toDigitFromUint8Array(stsdBoxData.slice(acbs + 10, acbs + 11))
      avcConfigurationBox.avcLevelIndication = toDigitFromUint8Array(stsdBoxData.slice(acbs + 11, acbs + 12))
      avcConfigurationBox.lengthSizeMinusOne = ''
      const spsCount = avcConfigurationBox.numOfSequenceParameterSets = Number(toBitsFromUint8Array(stsdBoxData.slice(acbs + 13, acbs + 14)).slice(-5), 2)
      const spss = []
      let idx = acbs + 14
      for (let i = 0; i < spsCount; i++) {
        const sps = {}
        sps.length = toDigitFromUint8Array(stsdBoxData.slice(idx, idx + 2))
        sps.NALUnit = stsdBoxData.slice(idx + 2, idx + 2 + sps.length)
        idx += 2 + sps.length
        spss.push(sps)
      }
      avcConfigurationBox.spss = spss

      const ppsCount = avcConfigurationBox.numOfPictureParameterSets = toDigitFromUint8Array(stsdBoxData.slice(idx, idx + 1))
      const ppss = []
      for (let i = 0; i < ppsCount; i++) {
        const pps = {}
        pps.length = toDigitFromUint8Array(stsdBoxData.slice(idx + 1, idx + 1 + 2))
        pps.NALUnit = stsdBoxData.slice(idx + 1 + 2, idx + 1 + 2 + pps.length)
        idx += 3 + pps.length
        ppss.push(pps)
      }
      avcConfigurationBox.ppss = ppss

      if (avcConfigurationBox.avcProfileIndication === 100 ||
        avcConfigurationBox.avcProfileIndication === 110 ||
        avcConfigurationBox.avcProfileIndication === 122 ||
        avcConfigurationBox.avcProfileIndication === 144
      ) {
        // todo
      }

      entry.avcConfigurationBox = avcConfigurationBox

      return entry
    }

    if (entryCount === 1) {
      sampleEntries.push(parseEntry(16))
    }

    return sampleEntries
  }

  _parseSTTS(sttsBox) {
    const sttsBoxData = sttsBox.data
    const entryCount = toDigitFromUint8Array(sttsBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        sampleCount: toDigitFromUint8Array(sttsBoxData.slice(16, 16 + (i + 1) * 4)),
        sampleDelta: toDigitFromUint8Array(sttsBoxData.slice(16 + (i + 1) * 4, 16 + (i + 1) * 8)),
      })
    }
    return entries
  }

  _parseSTSS(stssBox) {
    if (!stssBox) return

    const stssBoxData = stssBox.data
    const entryCount = toDigitFromUint8Array(stssBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        sampleNumber: toDigitFromUint8Array(stssBoxData.slice(16 + 4 * i, 16 + (i + 1) * 4)),
      })
    }
    return entries
  }

  _parseSTSZ(stszBox) {
    const stszBoxData = stszBox.data
    const sampleSize = toDigitFromUint8Array(stszBoxData.slice(12, 16))
    const sampleCount = toDigitFromUint8Array(stszBoxData.slice(16, 20))
    const entries = []
    if (sampleSize === 0) {
      for (let i = 0; i < sampleCount; i++) {
        const entrySize = toDigitFromUint8Array(stszBoxData.slice(20 + 4 * i, 20 + (i + 1) * 4))
        entries.push({
          entrySize,
          // offset: i && entries[i - 1].offset + entries[i - 1].entrySize
        })
      }
    }
    return {
      sampleSize,
      sampleCount,
      entries,
    }
  }

  _parseSTSC(stscBox) {
    const stscBoxData = stscBox.data
    const entryCount = toDigitFromUint8Array(stscBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        firstChunkIndex: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i, 16 + 12 * i + 4)),
        samplesPerChunk: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i + 4, 16 + 12 * i + 8)),
        sampleDescriptionIndex: toDigitFromUint8Array(stscBoxData.slice(16 + 12 * i + 8, 16 + 12 * i + 12)),
      })
    }
    const chunkIndexes = []
    let idx = 0
    for (let i = 0; i < entries.length; i++) {
      const length = entries[i + 1] ?
        entries[i + 1].firstChunkIndex - entries[i].firstChunkIndex :
        this.chunkOffsetBox.length - entries[i].firstChunkIndex + 1

      for (let j = 0; j < length; j++) {
        for (let k = 0; k < entries[i].samplesPerChunk; k++) {
          chunkIndexes.push({
            chunkIndex: idx,
            chunkOffsetIndex: k
          })
        }
        idx++
      }
    }
    return {
      entries,
      chunkIndexes
    }
  }

  _parseSTCO(stcoBox) {
    const stcoBoxData = stcoBox.data
    const entryCount = toDigitFromUint8Array(stcoBoxData.slice(12, 16))
    const entries = []
    for (let i = 0; i < entryCount; i++) {
      entries.push({
        chunkOffset: toDigitFromUint8Array(stcoBoxData.slice(16 + 4 * i, 16 + (i + 1) * 4)),
      })
    }
    return entries
  }
}
