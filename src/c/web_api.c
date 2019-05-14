#include <emscripten.h>
#include <stdio.h>
#include <libavformat/avformat.h>
#include <libavformat/avio.h>
#include <libavutil/file.h>
#include "preview.h"
#include "generate_sprite.h"

int main(int argc, char *argv[])
{
	printf("init success!\n");

	return 0;
}

EMSCRIPTEN_KEEPALIVE
PreviewResult *getPreviewData(uint8_t *sampleData, int sampleLength, int width, int height)
{
	PreviewResult *pr = decode_sample(sampleData, sampleLength, width, height);
	printf("ptr is: %p\n, frame ptr is: %p\n, data size is: %d\n",
			pr,
			pr->frameData,
			pr->size);

	return pr;
}

static int read_packet(void *opaque, uint8_t *buf, int buf_size)
{
    buffer_data *bd = (struct buffer_data *)opaque;
    buf_size = FFMIN(buf_size, bd->size);

    if (!buf_size)
        return AVERROR_EOF;
//    printf("ptr:%p size:%zu\n", bd->ptr, bd->size);

    /* copy internal buffer data to buf */
    memcpy(buf, bd->ptr, buf_size);
    bd->ptr  += buf_size;
    bd->size -= buf_size;

    return buf_size;
}

EMSCRIPTEN_KEEPALIVE
SpriteImage *getSpriteImage(uint8_t *buffer, const int buff_size)
{
    int ret;
    SpriteImage rt;
    AVFormatContext *fmt_ctx = NULL;
    AVIOContext *avio_ctx = NULL;
    uint8_t *avio_ctx_buffer = NULL;
    size_t avio_ctx_buffer_size = 4096;
    buffer_data bd = { 0 };

    /* fill opaque structure used by the AVIOContext read callback */
    bd.ptr  = buffer;
    bd.size = buff_size;

    if (!(fmt_ctx = avformat_alloc_context())) {
        ret = AVERROR(ENOMEM);
        goto end;
    }

    avio_ctx_buffer = av_malloc(avio_ctx_buffer_size);
    if (!avio_ctx_buffer) {
        ret = AVERROR(ENOMEM);
        goto end;
    }
    avio_ctx = avio_alloc_context(avio_ctx_buffer, avio_ctx_buffer_size,
                                  0, &bd, &read_packet, NULL, NULL);
    if (!avio_ctx) {
        ret = AVERROR(ENOMEM);
        goto end;
    }
    fmt_ctx->pb = avio_ctx;

    rt.data = (uint8_t *)malloc(100000000);
    generateSprite(fmt_ctx, &rt);

end:
    avformat_close_input(&fmt_ctx);

    /* note: the internal buffer could have changed, and be != avio_ctx_buffer */
    if (avio_ctx)
        av_freep(&avio_ctx->buffer);
    avio_context_free(&avio_ctx);

    return &rt;
}

