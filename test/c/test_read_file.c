#include <stdio.h>

int main(int argc, char* argv[])
{
	FILE *file = fopen("test.txt", "r");
	char data[] = {};
	fread(data, 1, 30, file);
	printf("%s", data);

	return 0;
}
