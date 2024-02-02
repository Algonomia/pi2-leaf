cmake_minimum_required(VERSION 3.10)
project(CudaProject CUDA)

set(CMAKE_CUDA_STANDARD 14)
set(CMAKE_CUDA_FLAGS "${CMAKE_CUDA_FLAGS} -Xcompiler -fopenmp")

add_executable(CudaProject main.cu)

set_target_properties(CudaProject PROPERTIES
        CUDA_SEPARABLE_COMPILATION ON)

target_link_libraries(CudaProject rt dl gomp cublas)
