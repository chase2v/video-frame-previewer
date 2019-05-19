#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
#include "generate_sprite.h"

int timebase;
int avgFrameRate;
int duration;
int count = 0;
int uw;
int uh;

int convertPixFmt(struct SwsContext *img_convert_ctx, AVFrame *frame, AVFrame *pFrameRGB)
{
    //1 先进行转换,  YUV420=>RGB24:
    int w = frame->width;
    int h = frame->height;


    int numBytes=avpicture_get_size(AV_PIX_FMT_RGB24, w, h);
    uint8_t *buffer=(uint8_t *)av_malloc(numBytes*sizeof(uint8_t));


    avpicture_fill((AVPicture *)pFrameRGB, buffer, AV_PIX_FMT_RGB24, w, h);

    sws_scale(img_convert_ctx, frame->data, frame->linesize,
              0, h, pFrameRGB->data, pFrameRGB->linesize);

	return 0;
}

int saveImage(uint8_t *images[], SpriteImage *spriteImage, int rows)
{
    int imagesLen = count;
    int cols = imagesLen / rows + 1;
    rows = imagesLen < rows ? imagesLen : rows;

	// 先分组
	uint8_t *imageGroups[cols][rows];
	int r = 0;
	int c = 0;
	for (int i = 0; i < imagesLen; i++) {
		imageGroups[i / rows][i % rows] = images[i];
	}

    spriteImage->data = (uint8_t *)av_malloc(cols * rows * uw * uh * 3 * sizeof(uint8_t));

    int len = 0;
    int cur = 0;
    for (int i = 0; i < cols; i++) {
    	for (int j = 0; j < uh; j++) {
		for (int k = 0; k < rows; k++) {
            for (int l = 0; l < uw * 3; l++) {
			    if (i * rows + k < imagesLen) {
                    *(spriteImage->data + len) = *(imageGroups[i][k] + j * uw * 3 + l);
                } else {
                    // 填充白色
                    *(spriteImage->data + len) = 255;
                }
                len++;
            }
		}
	}
    }

    spriteImage->size = len;
    spriteImage->width = uw;
    spriteImage->height = uh;
    spriteImage->rows = cols;
    spriteImage->count = imagesLen;

    return 0;
}

static int  decodeFrame(
        uint8_t *images[],
        AVCodecContext *avctx,
        struct SwsContext *img_convert_ctx,
        AVFrame *frame,
        int *frame_count,
        AVPacket *pkt,
        int interval,
        int last)
{
    int len, got_frame;
    char buf[1024];

    len = avcodec_decode_video2(avctx, frame, &got_frame, pkt);
    if (len < 0) {
        fprintf(stderr, "Error while decoding frame %d\n", *frame_count);
        return len;
    }
    if (got_frame && *frame_count % (avgFrameRate * interval) == 0) {
        printf("Saving %sframe %3d, %d\n", last ? "last " : "", *frame_count, count);
        fflush(stdout);

    	AVFrame *frameRGB;
    	frameRGB = av_frame_alloc();
    	convertPixFmt(img_convert_ctx, frame, frameRGB);
    	uw = frame->width;
    	uh = frame->height;
//    	printf("ptr of data: %p\n", frameRGB->data[0]);
    	images[count] = frameRGB->data[0];
    	av_frame_free(&frameRGB);
    	count++;
    }

    (*frame_count)++;

    if (pkt->data) {
        pkt->size -= len;
        pkt->data += len;
    }
    return 0;
}

AVCodecContext *initDecoder(AVFormatContext *av_fmt_ctx, int *stream_index)
{
    int ret;
    const AVCodec *codec;
    AVCodecContext *c= NULL;

    av_fmt_ctx->probesize = 2147483647;
    av_fmt_ctx->max_analyze_duration = 2147483647;

   AVStream *st = NULL;

    /* open input */
    if (avformat_open_input(&av_fmt_ctx, "test", NULL, NULL) < 0) {
        fprintf(stderr, "Could not open input\n");
        exit(1);
    }

    /* retrieve stream information */
    if (avformat_find_stream_info(av_fmt_ctx, NULL) < 0) {
        fprintf(stderr, "Could not find stream information\n");
        exit(1);
    }

    /* dump input information to stderr */
    av_dump_format(av_fmt_ctx, 0, "", 0);

    ret = av_find_best_stream(av_fmt_ctx, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0);
    if (ret < 0) {
        fprintf(stderr, "Could not find %s stream in input file '%s'\n",
                av_get_media_type_string(AVMEDIA_TYPE_VIDEO));
        return ret;
    }

    *stream_index = ret;
    st = av_fmt_ctx->streams[*stream_index];
    timebase = st->time_base.den;
    avgFrameRate = st->avg_frame_rate.num;
    duration = st->duration;

    /* find decoder for the stream */
    codec = avcodec_find_decoder(st->codecpar->codec_id);
    if (!codec) {
        fprintf(stderr, "Failed to find %s codec\n",
                av_get_media_type_string(AVMEDIA_TYPE_VIDEO));
        return AVERROR(EINVAL);
    }

    c = avcodec_alloc_context3(NULL);
    if (!c) {
        fprintf(stderr, "Could not allocate video codec context\n");
        exit(1);
    }

    /* Copy codec parameters from input stream to output codec context */
    if ((ret = avcodec_parameters_to_context(c, st->codecpar)) < 0) {
        fprintf(stderr, "Failed to copy %s codec parameters to decoder context\n",
                av_get_media_type_string(AVMEDIA_TYPE_VIDEO));
        return ret;
    }

    /* open it */
    if (avcodec_open2(c, codec, NULL) < 0) {
        fprintf(stderr, "Could not open codec\n");
        exit(1);
    }

    return c;
}

int generateSprite(AVFormatContext *av_fmt_ctx, SpriteImage *spriteImage, int interval, int cols)
{
    struct SwsContext *img_convert_ctx;
    AVCodecContext *c;
    AVFrame *frame;
    AVPacket avpkt;
    int stream_index;
    int frame_count;

    // init decoder
    c = initDecoder(av_fmt_ctx, &stream_index);
    uint8_t *images[duration / (timebase * interval)];

    img_convert_ctx = sws_getContext(c->width, c->height,
                                     c->pix_fmt || AV_PIX_FMT_YUV420P,
                                     c->width, c->height,
                                     AV_PIX_FMT_RGB24,
                                     SWS_BICUBIC, NULL, NULL, NULL);

    if (img_convert_ctx == NULL)
    {
        fprintf(stderr, "Cannot initialize the conversion context\n");
        exit(1);
    }

    frame = av_frame_alloc();
    if (!frame) {
        fprintf(stderr, "Could not allocate video frame\n");
        exit(1);
    }

    av_init_packet(&avpkt);

    frame_count = 0;
    int rt = av_read_frame(av_fmt_ctx, &avpkt);
    if (rt < 0) {
        printf("Could not find data: %s\n", av_err2str(rt));
        exit(1);
    }
    count = 0;
    while (av_read_frame(av_fmt_ctx, &avpkt) >= 0) {
        if(avpkt.stream_index == stream_index){
            if (decodeFrame(images, c, img_convert_ctx, frame, &frame_count, &avpkt, interval, 0) < 0)
                exit(1);
        }

        av_packet_unref(&avpkt);
    }

    avpkt.data = NULL;
    avpkt.size = 0;
    decodeFrame(images, c, img_convert_ctx, frame, &frame_count, &avpkt, interval, 1);

    // 拼接图片
    saveImage(images, spriteImage, cols);

end:
    sws_freeContext(img_convert_ctx);
    avcodec_free_context(&c);
    av_frame_free(&frame);

    return 0;
}

