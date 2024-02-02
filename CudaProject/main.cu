#include <stdio.h>
#include <stdlib.h>
#include <cublas_v2.h>
#define BLOCK_SIZE 32

#define FILENAME "data.csv"

void matrix_mult(double *a,double *b, double *c, int m, int n, int k)
{
    double sum = 0;
    for (int row = 0; row<m; row++) {
        for (int col = 0; col<k; col++) {
            sum = 0;
            for(int i = 0; i < n; i++) {
                sum += a[row * n + i] * b[i * k + col];
            }
            c[row * k + col] = sum;
        }
    }
}

__global__ void gpu_nodiag_normalize(double *A, double *I, int n, int i){
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x < n && y < n)
        if (x == i && x!=y){
            I[x*n + y] /= A[i*n + i];
            A[x*n + y] /= A[i*n + i];
        }

}

void nodiag_normalize(double *A, double *I, int n, int i){

    for (int x = 0; x<n; x++) {
        for (int y = 0; y<n; y++) {
            if (x == i && x!=y){
                I[x*n + y] /= A[i*n + i];
                A[x*n + y] /= A[i*n + i];
            }
        }
    }
}

__global__ void gpu_diag_normalize(double *A, double *I, int n, int i){
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x < n && y < n)
        if (x == y && x == i){
            I[x*n + y] /= A[i*n + i];
            A[x*n + y] /= A[i*n + i];
        }

}

void diag_normalize(double *A, double *I, int n, int i){

    for (int x = 0; x<n; x++) {
        for (int y = 0; y<n; y++) {
            if (x == y && x == i){
                I[x*n + y] /= A[i*n + i];
                A[x*n + y] /= A[i*n + i];
            }
        }
    }
}

__global__ void gpu_gaussjordan(double *A, double *I, int n, int i){
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x < n && y < n){
        if (x != i){
            I[x*n + y] -= I[i*n + y] * A[x*n + i];
            if (y != i){
                A[x*n + y] -= A[i*n + y] * A[x*n + i];
            }
        }
    }

}

void gaussjordan(double *A, double *I, int n, int i){

    for (int x = 0; x<n; x++) {
        for (int y = 0; y<n; y++) {
            if (x != i){
                I[x*n + y] -= I[i*n + y] * A[x*n + i];
                if (y != i){
                    A[x*n + y] -= A[i*n + y] * A[x*n + i];
                }
            }
        }
    }
}

__global__ void gpu_set_zero(double *A, double *I, int n, int i){
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;

    if (x < n && y < n){
        if (x != i){
            if (y == i){
                A[x*n + y] = 0;
            }
        }
    }
}

void set_zero(double *A, double *I, int n, int i){

    for (int x = 0; x<n; x++) {
        for (int y = 0; y<n; y++) {
            if (x != i){
                if (y == i){
                    A[x*n + y] = 0;
                }
            }
        }
    }
}

void gpu_matrix_inv_gauss_jordan(double *d_A, double *result, int n)
{
    dim3 threadsPerBlock(BLOCK_SIZE, BLOCK_SIZE);
    dim3 numBlocks((n + BLOCK_SIZE - 1) / BLOCK_SIZE, (n + BLOCK_SIZE - 1) / BLOCK_SIZE);

    for (int i = 0; i<n; i++) {
        gpu_nodiag_normalize<<<numBlocks, threadsPerBlock>>>(d_A, result, n, i);
        gpu_diag_normalize<<<numBlocks, threadsPerBlock>>>(d_A, result, n, i);
        gpu_gaussjordan<<<numBlocks, threadsPerBlock>>>(d_A, result, n, i);
        gpu_set_zero<<<numBlocks, threadsPerBlock>>>(d_A, result, n, i);
    }

}

void matrix_inv_gauss_jordan(double *d_A, double *result, int n)
{
    for (int i = 0; i<n; i++) {
        nodiag_normalize(d_A, result, n, i);
        diag_normalize(d_A, result, n, i);
        gaussjordan(d_A, result, n, i);
        set_zero(d_A, result, n, i);
    }

}

/*
*********************************************************************
function name: gpu_matrix_sum
description: sum of two matrix (only same size)
parameters:
            &a GPU device pointer to a n X n matrix (A)
            &b GPU device pointer to a n X n matrix (B)
            &c GPU device output purpose pointer to a n X n matrix (C)
            to store the result
Note:
    grid and block should be configured as:
        dim3 dimGrid((k + BLOCK_SIZE - 1) / BLOCK_SIZE, (m + BLOCK_SIZE - 1) / BLOCK_SIZE);
        dim3 dimBlock(BLOCK_SIZE, BLOCK_SIZE);
    further sppedup can be obtained by using shared memory to decrease global memory access times
return: none
*********************************************************************
*/
__global__ void gpu_matrix_sum(double *a, double *b, double *c, int n)
{
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if(row < n)
    {
        for(int i = 0; i < n; i++)
        {
            c[row * n + i] = a[row * n + i] + b[row * n + i];
        }
    }
}

/*
*********************************************************************
function name: gpu_matrix_diff
description: difference of two matrix (only same size)
parameters:
            &a GPU device pointer to a n X n matrix (A)
            &b GPU device pointer to a n X n matrix (B)
            &c GPU device output purpose pointer to a n X n matrix (C)
            to store the result
Note:
    grid and block should be configured as:
        dim3 dimGrid((k + BLOCK_SIZE - 1) / BLOCK_SIZE, (m + BLOCK_SIZE - 1) / BLOCK_SIZE);
        dim3 dimBlock(BLOCK_SIZE, BLOCK_SIZE);
    further sppedup can be obtained by using shared memory to decrease global memory access times
return: none
*********************************************************************
*/
__global__ void gpu_matrix_diff(double *a, double *b, double *c, int n)
{
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if(row < n)
    {
        for(int i = 0; i < n; i++)
        {
            c[row * n + i] = a[row * n + i] - b[row * n + i];
        }
    }
}

void matrix_diff(double *a, double *b, double *c, int n)
{
    for(int j = 0; j < n; j++)
    {
        for(int i = 0; i < n; i++)
        {
            double val = a[j * n + i] - b[j * n + i];
            c[j * n + i] = val;
        }
    }
}

/*
*********************************************************************
function name: gpu_matrix_identity
description: generate identity matrix
parameters:
            &a GPU device output purpose pointer to a n X n matrix (C)
            to store the result
Note:
    grid and block should be configured as:
        dim3 dimGrid((k + BLOCK_SIZE - 1) / BLOCK_SIZE, (m + BLOCK_SIZE - 1) / BLOCK_SIZE);
        dim3 dimBlock(BLOCK_SIZE, BLOCK_SIZE);
    further sppedup can be obtained by using shared memory to decrease global memory access times
return: none
*********************************************************************
*/
__global__ void gpu_matrix_identity(double *a, int n)
{
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if(row < n)
    {
        for(int i = 0; i < n; i++)
        {
            if(i == row) {
                a[row * n + i] = 1.0;
            } else {
                a[row * n + i] = 0.0;
            }
        }
    }
}

void matrix_identity(double *a, int n)
{
    for(int j = 0; j < n; j++)
    {
        for(int i = 0; i < n; i++)
        {
            if(i == j) {
                a[j * n + i] = 1.0;
            } else {
                a[j * n + i] = 0.0;
            }
        }
    }
}

/*
*********************************************************************
function name: gpu_matrix_diag
description: generate matrix by keeping only diagonal elements
parameters:
            &a GPU device pointer to a n X n matrix (A)
            &b GPU device output purpose pointer to b n X n matrix (B)
            to store the result
Note:
    grid and block should be configured as:
        dim3 dimGrid((k + BLOCK_SIZE - 1) / BLOCK_SIZE, (m + BLOCK_SIZE - 1) / BLOCK_SIZE);
        dim3 dimBlock(BLOCK_SIZE, BLOCK_SIZE);
    further sppedup can be obtained by using shared memory to decrease global memory access times
return: none
*********************************************************************
*/
__global__ void gpu_matrix_diag(double *a, double *b, int n)
{
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    if(row < n)
    {
        for(int i = 0; i < n; i++)
        {
            if(i == row) {
                b[row * n + i] = a[row * n + i];
            } else {
                b[row * n + i] = 0;
            }
        }
    }
}

void matrix_diag(double *a, double *b, int n)
{
    for(int j = 0; j < n; j++)
    {
        for(int i = 0; i < n; i++)
        {
            if(i == j) {
                b[j * n + i] = a[j * n + i];
            } else {
                b[j * n + i] = 0;
            }
        }
    }
}

/*
*********************************************************************
function name: cpu_matrix_mult
description: dot product of two matrix (not only square) in CPU,
             for validating GPU results
parameters:
            &a CPU device pointer to a n X n matrix (A)
            &b CPU device pointer to a n X n matrix (B)
            &c CPU device output purpose pointer to a n X n matrix (C)
            to store the result
Note:
    grid and block should be configured as:
        dim3 dim_grid((n - 1) / BLOCK_SIZE + 1, (n - 1) / BLOCK_SIZE + 1, 1);
        dim3 dim_block(BLOCK_SIZE, BLOCK_SIZE, 1);
return: none
*********************************************************************
*/
__global__ void gpu_square_matrix_mult(double *d_a, double *d_b, double *d_result, int n)
{
    __shared__ double tile_a[BLOCK_SIZE][BLOCK_SIZE];
    __shared__ double tile_b[BLOCK_SIZE][BLOCK_SIZE];

    int row = blockIdx.y * BLOCK_SIZE + threadIdx.y;
    int col = blockIdx.x * BLOCK_SIZE + threadIdx.x;
    double tmp = 0;
    int idx;

    for (int sub = 0; sub < gridDim.x; ++sub)
    {
        idx = row * n + sub * BLOCK_SIZE + threadIdx.x;
        if(idx >= n*n)
        {
            // n may not divisible by BLOCK_SIZE
            tile_a[threadIdx.y][threadIdx.x] = 0;
        }
        else
        {
            tile_a[threadIdx.y][threadIdx.x] = d_a[idx];
        }

        idx = (sub * BLOCK_SIZE + threadIdx.y) * n + col;
        if(idx >= n*n)
        {
            tile_b[threadIdx.y][threadIdx.x] = 0;
        }
        else
        {
            tile_b[threadIdx.y][threadIdx.x] = d_b[idx];
        }
        __syncthreads();

        for (int k = 0; k < BLOCK_SIZE; ++k)
        {
            tmp += tile_a[threadIdx.y][k] * tile_b[k][threadIdx.x];
        }
        __syncthreads();
    }
    if(row < n && col < n)
    {
        d_result[row * n + col] = tmp;
    }
}

/*
*********************************************************************
function name: gpu_matrix_transpose
description: matrix transpose
parameters:
            &mat_in GPU device pointer to a rows X cols matrix
            &mat_out GPU device output purpose pointer to a cols X rows matrix
            to store the result
Note:
    grid and block should be configured as:
        dim3 dim_grid((n - 1) / BLOCK_SIZE + 1, (n - 1) / BLOCK_SIZE + 1, 1);
        dim3 dim_block(BLOCK_SIZE, BLOCK_SIZE, 1);
return: none
*********************************************************************
*/
__global__ void gpu_matrix_transpose(int* mat_in, int* mat_out, unsigned int rows, unsigned int cols)
{
    unsigned int idx = blockIdx.x * blockDim.x + threadIdx.x;
    unsigned int idy = blockIdx.y * blockDim.y + threadIdx.y;

    if (idx < cols && idy < rows)
    {
        unsigned int pos = idy * cols + idx;
        unsigned int trans_pos = idx * rows + idy;
        mat_out[trans_pos] = mat_in[pos];
    }
}

/*
*********************************************************************
function name: gpu_matrix_transpose
description: matrix transpose
parameters:
            &mat_in GPU device pointer to a rows X cols matrix
            &mat_out GPU device output purpose pointer to a cols X rows matrix
            to store the result
Note:
    grid and block should be configured as:
        dim3 dim_grid((n - 1) / BLOCK_SIZE + 1, (n - 1) / BLOCK_SIZE + 1, 1);
        dim3 dim_block(BLOCK_SIZE, BLOCK_SIZE, 1);
return: none
*********************************************************************
*/
__global__ void gpu_matrix_norm(double *a, double *c, int m, int n)
{
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    double sum = 0;
    if(row < m)
    {
        for(int i = 0; i < n; i++)
        {
            sum += a[row * n + i] * a[row * n + i];
        }
    }
    c[row] += sum;
}

int cpuComputation(FILE *fp, int n) {
    ssize_t line_size;
    char *line_buf = NULL;
    size_t line_buf_size = 0;
    int line_count = 0;

    /* Read matrix from file */
    double *h_a = static_cast<double *>(malloc(sizeof(double) * n * n));

    /* Loop through until we are done with the file. */
    do {
        int i = 0;

        /* Get the next line */
        line_size = getline(&line_buf, &line_buf_size, fp);

        /* Show the line details */
        char * pch;
        pch = strtok(line_buf, ",");
        while (pch != NULL && line_size >= 0)
        {
            h_a[line_count * n + i] = atof(pch);
            ++i;
            pch = strtok(NULL, ",");
        }

        /* Increment our line count */
        line_count++;
    } while (line_size >= 0);

    line_buf = NULL;

    /* Close the file now that we are done with it */
    fclose(fp);

    double *identity = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *identityMinusA = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *invertedMatrix = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *diagMatrix = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *invertedDiag = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *productA = static_cast<double *>(malloc(sizeof(double) * n * n));
    double *productB = static_cast<double *>(malloc(sizeof(double) * n * n));

    fprintf(stdout, "Generating Identity Matrix\n");
    matrix_identity(invertedMatrix, n);
    matrix_identity(invertedDiag, n);
    matrix_identity(identity, n);

    fprintf(stdout, "Diff with adjacent Matrix\n");
    matrix_diff(identity, h_a, identityMinusA, n);

    fprintf(stdout, "Invert DiffMatrix\n");
    matrix_inv_gauss_jordan(identityMinusA, invertedMatrix, n);

    fprintf(stdout, "Get diagonal matrix from invertedMatrix\n");
    matrix_diag(invertedMatrix, diagMatrix, n);

    fprintf(stdout, "Invert diagonal matrix\n");
    matrix_inv_gauss_jordan(diagMatrix, invertedDiag, n);

    fprintf(stdout, "Multiply matrix\n");
    matrix_mult(invertedDiag, invertedMatrix, productA, n, n, n);
    matrix_mult(productA, h_a, productB, n, n, n);

    FILE *fpOut;
    fpOut = fopen("./output.csv","w");
    if (!fpOut) {
        fprintf(stderr, "Error opening file to write\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            fprintf(fpOut,"%20.15f", productB[i*n + j]);
            if (j != n - 1) {
                fprintf(fpOut, ",");
            }
        }
        fprintf(fpOut, "\n");
    }

    fclose(fpOut);

    return EXIT_SUCCESS;
}

int cudaComputation(FILE *fp, int n) {
    char *line_buf = NULL;
    size_t line_buf_size = 0;
    ssize_t line_size;
    int line_count = 0;

    /* Read matrix from file */
    double *h_a, *h_b, *d_a;
    cudaMallocHost((void **) &h_a, sizeof(double)*n*n);
    cudaMallocHost((void **) &h_b, sizeof(double)*n*n);
    cudaMalloc((void **) &d_a, sizeof(double)*n*n);

    fprintf(stdout, "Read FILE\n");
    /* Loop through until we are done with the file. */
    do {
        int i = 0;

        /* Get the next line */
        line_size = getline(&line_buf, &line_buf_size, fp);

        /* Show the line details */
        char * pch;
        pch = strtok(line_buf, ",");
        while (pch != NULL && line_size >= 0)
        {
            h_a[line_count * n + i] = atof(pch);
            ++i;
            pch = strtok(NULL, ",");
        }

        /* Increment our line count */
        line_count++;
    } while (line_size >= 0);

    line_buf = NULL;

    /* Close the file now that we are done with it */
    fclose(fp);

    // allocate memory in host RAM, h_cc is used to store CPU result
    cudaMemcpy(d_a, h_a, sizeof(double)*n*n, cudaMemcpyHostToDevice);

    double *identity, *identityMinusA, *invertedMatrix, *diagMatrix, *invertedDiag, *productA, *productB;
    cudaMallocHost((void **) &identity, sizeof(double)*n*n);
    cudaMallocHost((void **) &identityMinusA, sizeof(double)*n*n);
    cudaMallocHost((void **) &invertedMatrix, sizeof(double)*n*n);
    cudaMallocHost((void **) &diagMatrix, sizeof(double)*n*n);
    cudaMallocHost((void **) &invertedDiag, sizeof(double)*n*n);
    cudaMallocHost((void **) &productA, sizeof(double)*n*n);
    cudaMallocHost((void **) &productB, sizeof(double)*n*n);

    cudaMalloc((void **) &identity, sizeof(double)*n*n);
    cudaMalloc((void **) &identityMinusA, sizeof(double)*n*n);
    cudaMalloc((void **) &invertedMatrix, sizeof(double)*n*n);
    cudaMalloc((void **) &diagMatrix, sizeof(double)*n*n);
    cudaMalloc((void **) &invertedDiag, sizeof(double)*n*n);
    cudaMalloc((void **) &productA, sizeof(double)*n*n);
    cudaMalloc((void **) &productB, sizeof(double)*n*n);

    unsigned int grid_rows = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    unsigned int grid_cols = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    dim3 dimGrid(grid_cols, grid_rows);
    dim3 dimBlock(BLOCK_SIZE, BLOCK_SIZE);

    fprintf(stdout, "Generating Identity Matrix\n");
    gpu_matrix_identity<<<dimGrid, dimBlock>>>(invertedMatrix, n);
    gpu_matrix_identity<<<dimGrid, dimBlock>>>(invertedDiag, n);
    gpu_matrix_identity<<<dimGrid, dimBlock>>>(identity, n);

    fprintf(stdout, "Diff with adjacent Matrix\n");
    gpu_matrix_diff<<<dimGrid, dimBlock>>>(identity, d_a, identityMinusA, n);

    fprintf(stdout, "Invert DiffMatrix\n");
    gpu_matrix_inv_gauss_jordan(identityMinusA, invertedMatrix, n);

    fprintf(stdout, "Get diagonal matrix from invertedMatrix\n");
    gpu_matrix_diag<<<dimGrid, dimBlock>>>(invertedMatrix, diagMatrix, n);

    fprintf(stdout, "Invert diagonal matrix\n");
    gpu_matrix_inv_gauss_jordan(diagMatrix, invertedDiag, n);

    fprintf(stdout, "Multiply matrix\n");
    gpu_square_matrix_mult<<<dimGrid, dimBlock>>>(invertedDiag, invertedMatrix, productA, n);
    gpu_square_matrix_mult<<<dimGrid, dimBlock>>>(productA, d_a, productB, n);

    cudaMemcpy(h_b, productB, sizeof(double)*n*n, cudaMemcpyDeviceToHost);

    FILE *fpOut;
    fpOut = fopen("./output.csv","w");
    if (!fpOut) {
        fprintf(stderr, "Error opening file to write\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            fprintf(fpOut,"%20.15f", h_b[i*n + j]);
            if (j != n - 1) {
                fprintf(fpOut, ",");
            }
        }
        fprintf(fpOut, "\n");
    }

    fclose(fpOut);

    cudaFree(d_a), cudaFree(identity), cudaFree(identityMinusA), cudaFree(invertedMatrix),
            cudaFree(diagMatrix), cudaFree(invertedDiag), cudaFree(productA), cudaFree(productB);

    return EXIT_SUCCESS;
}


/*
*********************************************************************
function name: main
        description: test and compare
parameters:
none
return: none
*********************************************************************
*/
int main(int argc, char const *argv[])
{
    char fileName[100] = FILENAME;

    FILE *fp = fopen(fileName, "r");
    if (!fp) {
        fprintf(stderr, "Error opening file '%s'\n", fileName);
        return EXIT_FAILURE;
    }

    int n = 0;
    int ch;
    while(!feof(fp)) {
        ch = fgetc(fp);
        if(ch == '\n') {
            n++;
        }
    }
    rewind(fp);

    int devices = 0;

    cudaError_t err = cudaGetDeviceCount(&devices);

    if (devices > 0 && err == cudaSuccess) {
        fprintf(stdout, "Launching CUDA Algo\n");
        return cudaComputation(fp, n);
    } else {
        fprintf(stdout, "Launching CPU Algo\n");
        return cpuComputation(fp, n);
    }

}
