from __future__ import annotations

import logging
import mimetypes
import os
from typing import Any, Dict, Optional


def upload_file_to_s3(
    filepath: str,
    *,
    key_prefix: str,
    bucket: Optional[str] = None,
    content_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Upload a local file to S3.

    No-op (returns None) when `S3_BUCKET` is not configured.
    Uses IAM role credentials when running on AWS.
    """

    bucket_name = bucket or os.getenv("S3_BUCKET")
    if not bucket_name:
        return None

    # Import lazily so local/dev environments without boto3 don't crash.
    try:
        import boto3  # type: ignore
    except Exception as e:
        logging.warning(f"boto3 not available; skipping S3 upload: {e}")
        return None

    filename = os.path.basename(filepath)
    prefix = (key_prefix or "").strip("/")
    key = f"{prefix}/{filename}" if prefix else filename

    if content_type is None:
        guessed, _ = mimetypes.guess_type(filename)
        content_type = guessed

    extra_args: Dict[str, Any] = {}
    if content_type:
        extra_args["ContentType"] = content_type

    s3 = boto3.client("s3")

    kwargs: Dict[str, Any] = {}
    if extra_args:
        kwargs["ExtraArgs"] = extra_args

    s3.upload_file(filepath, bucket_name, key, **kwargs)

    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if region:
        url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{key}"
    else:
        url = f"https://{bucket_name}.s3.amazonaws.com/{key}"

    return {
        "bucket": bucket_name,
        "key": key,
        "uri": f"s3://{bucket_name}/{key}",
        "url": url,
    }
