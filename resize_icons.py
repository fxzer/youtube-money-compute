#!/usr/bin/env python3
"""
图标尺寸调整脚本
将logo.png调整为标准尺寸：
- 16x16
- 48x48  
- 128x128
"""

import os
import subprocess

def check_sips():
    """检查是否安装了sips工具"""
    try:
        subprocess.run(['sips', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def resize_with_sips(input_path, output_path, size):
    """使用macOS内置的sips工具调整图片尺寸"""
    try:
        # 使用sips调整尺寸
        cmd = [
            'sips', '-z', str(size[1]), str(size[0]), input_path,
            '--out', output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"✓ 已生成 {output_path} ({size[0]}x{size[1]})")
        
    except subprocess.CalledProcessError as e:
        print(f"✗ 处理 {input_path} 时出错: {e.stderr.decode()}")
    except Exception as e:
        print(f"✗ 处理 {input_path} 时出错: {e}")

def main():
    # 源文件和目标尺寸
    source_file = 'logo.png'
    target_sizes = {
        'icon-16.png': (16, 16),
        'icon-32.png': (32, 32),
        'icon-48.png': (48, 48),
        'icon-96.png': (96, 96),
        'icon-128.png': (128, 128)
    }
    
    print("开始生成不同尺寸的图标...")
    
    if not check_sips():
        print("✗ 未找到sips工具，请确保在macOS系统上运行")
        return
    
    # 检查源文件是否存在
    if not os.path.exists(source_file):
        print(f"✗ 源文件不存在: {source_file}")
        return
    
    print(f"✓ 找到源文件: {source_file}")
    
    # 生成不同尺寸的图标
    for filename, size in target_sizes.items():
        resize_with_sips(source_file, filename, size)
    
    print("\n图标生成完成！")
    print("生成的文件:")
    for filename in target_sizes.keys():
        if os.path.exists(filename):
            print(f"  - {filename}")

if __name__ == "__main__":
    main()
