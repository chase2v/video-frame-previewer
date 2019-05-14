#include <stdio.h>

#include <libavutil/avutil.h>
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>

#include "preview.h"

int scale_frame(struct SwsContext *img_convert_ctx, AVFrame *frame, AVFrame *frameRGB)
{
    //1 先进行转换,  YUV420=>RGB24:
    int w = frame->width;
    int h = frame->height;

    int numBytes=avpicture_get_size(AV_PIX_FMT_BGR24, w, h);
    uint8_t *buffer=(uint8_t *)av_malloc(numBytes*sizeof(uint8_t));

    avpicture_fill((AVPicture *)frameRGB, buffer, AV_PIX_FMT_BGR24, w, h);

    sws_scale(img_convert_ctx, frame->data, frame->linesize,
              0, h, frameRGB->data, frameRGB->linesize);

    return numBytes;
}

int gen_frame_from_pkt(AVCodecContext *avctx, AVFrame *frame, AVPacket *pkt)
{
	if (avcodec_send_packet(avctx, pkt))
	{
	    printf("%s %d avcodec_send_packet fail\n",__func__,__LINE__);
		return -1;
	}

	int ret = avcodec_receive_frame(avctx, frame);
	if(ret < 0)
	{
		if (ret == AVERROR(EAGAIN)) printf("111");
		if (ret == AVERROR_EOF) printf("222");
	        printf("%s %d avcodec_receive_frame fail, ret: %d\n", __func__, __LINE__, ret);
		return -1;
	}

	return 0;
}

PreviewResult *decode_sample(uint8_t *sampleData, int sampleDataSize, int width, int height)
{
	AVPacket av_pkt;
	AVFrame *av_frame;
	struct SwsContext *sws_ctx;
	AVCodec *av_codec;
	AVCodecContext *avcodec_ctx;
	struct AVCodecParameters av_codec_params;
	int ret;
	int frame_count;
	PreviewResult result;
	AVFrame *resultFrame;

	av_init_packet(&av_pkt);
	av_pkt.data = sampleData;
	av_pkt.size = sampleDataSize;
	av_pkt.duration = 1000;
	av_pkt.pos = 0;

	av_codec = avcodec_find_decoder(AV_CODEC_ID_H264);
	if (!av_codec) {
		printf("initialize codec failed!");
	}

	avcodec_ctx = avcodec_alloc_context3(NULL);
	if (!avcodec_ctx) {
            fprintf(stderr, "Could not allocate video codec context\n");
            exit(1);
        }

	av_codec_params.codec_type = 0;
	av_codec_params.codec_id = AV_CODEC_ID_H264;
	// av_codec_params.codec_tag = 828601953;
	// av_codec_params.format = AV_PIX_FMT_YUV420P;
	av_codec_params.width = width;
	av_codec_params.height = height;
	// av_codec_params.bit_rate = 29347;
	// av_codec_params.bits_per_coded_sample = 24;
	// av_codec_params.bits_per_raw_sample = 8;
	av_codec_params.level = 30;
	// av_codec_params.sample_aspect_ratio = (AVRational){1, 1};
	av_codec_params.field_order = 0;
	av_codec_params.color_range = 0;
	av_codec_params.color_primaries = 2;
	av_codec_params.color_trc = 2;
	av_codec_params.color_space = 2;
	av_codec_params.chroma_location = 1;
	av_codec_params.video_delay = 0;
	if (avcodec_parameters_to_context(avcodec_ctx, &av_codec_params) < 0) {
		printf("copy params failed!");
	}

	ret = avcodec_open2(avcodec_ctx, av_codec, NULL);
	if (ret != 0) {
		printf("open codec failed!");
	}

	sws_ctx = sws_getContext(avcodec_ctx->width,
            avcodec_ctx->height,
            avcodec_ctx->pix_fmt,
            avcodec_ctx->width,
		    avcodec_ctx->height,
		    AV_PIX_FMT_RGB24,
		    SWS_BICUBIC, NULL, NULL, NULL);

	av_frame = av_frame_alloc();

	if (gen_frame_from_pkt(avcodec_ctx, av_frame, &av_pkt) < 0) {
		printf("Failed to generate frame");
		goto unref;
	}

    resultFrame = av_frame_alloc();
	result.size = scale_frame(sws_ctx, av_frame, resultFrame);
	result.frameData = resultFrame->data[0];

unref:
	av_packet_unref(&av_pkt);
	sws_freeContext(sws_ctx);
	avcodec_free_context(&avcodec_ctx);
	av_frame_free(&av_frame);

	return &result;
}
