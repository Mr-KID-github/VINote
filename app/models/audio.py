"""
音频下载结果数据模型
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AudioDownloadResult:
    """视频/音频下载后的元数据"""
    file_path: str                  # 本地音频文件路径
    title: str                      # 视频标题
    duration: float                 # 时长（秒）
    video_id: str                   # 视频唯一 ID
    platform: str                   # 来源平台 (youtube / bilibili / local)
    cover_url: Optional[str] = None # 封面图 URL
    raw_info: dict = field(default_factory=dict)
