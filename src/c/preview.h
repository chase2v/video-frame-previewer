#include <libavformat/avformat.h>

typedef struct PreviewResult {
	int size;
	uint8_t *frameData;
} PreviewResult;

int scale_frame(struct SwsContext *img_convert_ctx, AVFrame *frame, AVFrame *frameRGB);
int gen_frame_from_pkt(AVCodecContext *avctx, AVFrame *frame, AVPacket *pkt);
PreviewResult *decode_sample(uint8_t *sampleData, int sampleDataSize);

