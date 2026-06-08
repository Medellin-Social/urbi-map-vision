"""S3 document upload helper.

Env vars required:
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION          — default: us-east-1
  S3_BUCKET           — bucket name
  S3_PUBLIC_URL       — base URL for public files (e.g. https://cdn.medellin.social)
                        Falls back to https://{bucket}.s3.amazonaws.com

If S3_BUCKET is unset, uploads are skipped and a placeholder URL is returned
so the feature doesn't break in dev without AWS credentials.
"""
from __future__ import annotations

import asyncio
import mimetypes
import os
import uuid
from pathlib import PurePosixPath

import boto3
from botocore.exceptions import BotoCoreError, ClientError

_BUCKET     = os.getenv("S3_BUCKET", "")
_REGION     = os.getenv("AWS_REGION", "us-east-1")
_PUBLIC_URL = os.getenv("S3_PUBLIC_URL", "")


def _client():
    return boto3.client("s3", region_name=_REGION)


def _upload_sync(file_bytes: bytes, key: str, content_type: str) -> str:
    if not _BUCKET:
        print(f"[S3 STUB] would upload {key} ({len(file_bytes)} bytes)")
        return f"https://placeholder.s3.amazonaws.com/{key}"

    c = _client()
    c.put_object(
        Bucket=_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
        ACL="public-read",
    )
    base = _PUBLIC_URL or f"https://{_BUCKET}.s3.amazonaws.com"
    return f"{base}/{key}"


async def upload_file(
    file_bytes: bytes,
    filename: str,
    folder: str = "agentes",
) -> str:
    ext = PurePosixPath(filename).suffix.lower() or ".bin"
    content_type = mimetypes.types_map.get(ext, "application/octet-stream")
    key = f"{folder}/{uuid.uuid4().hex}{ext}"
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _upload_sync, file_bytes, key, content_type)
