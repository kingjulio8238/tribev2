# Copyright (c) Meta Platforms, Inc. and affiliates.
# All rights reserved.
#
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""Upload viewer data to Cloudflare R2 for sharing.

Usage::

    from tribev2.share import upload_to_r2

    share_url = upload_to_r2(
        data_dir="./viewer_data",
        viewer_url="https://tribe-viewer.vercel.app",
    )
    print(f"Share URL: {share_url}")

Requires environment variables:
    R2_ACCOUNT_ID: Cloudflare account ID
    R2_ACCESS_KEY_ID: R2 access key
    R2_SECRET_ACCESS_KEY: R2 secret key
    R2_BUCKET_NAME: R2 bucket name (default: "tribe-viewer-data")
    R2_PUBLIC_URL: Public URL for the bucket (e.g., https://data.tribe.dev)
"""

import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


def upload_to_r2(
    data_dir: str | Path,
    viewer_url: str = "https://tribe-viewer.vercel.app",
    share_id: str | None = None,
    bucket_name: str | None = None,
) -> str:
    """Upload viewer_data directory to R2 and return a shareable URL.

    Parameters
    ----------
    data_dir:
        Path to the viewer_data directory containing mesh/, predictions/,
        stimulus/, emotions.json, report.json.
    viewer_url:
        Base URL of the deployed viewer.
    share_id:
        Custom share ID. If None, generates a random one.
    bucket_name:
        R2 bucket name. Defaults to R2_BUCKET_NAME env var or "tribe-viewer-data".

    Returns
    -------
    Shareable URL string.
    """
    try:
        import boto3
    except ImportError:
        raise ImportError("boto3 is required for R2 upload. Install with: pip install boto3")

    data_dir = Path(data_dir)
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    # Config from env
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = bucket_name or os.environ.get("R2_BUCKET_NAME", "tribe-viewer-data")
    public_url = os.environ.get("R2_PUBLIC_URL", "")

    if not all([account_id, access_key, secret_key]):
        raise ValueError(
            "R2 credentials not set. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY environment variables."
        )

    # Generate share ID
    if share_id is None:
        share_id = uuid.uuid4().hex[:12]

    # Create S3 client for R2
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    # Content type mapping
    content_types = {
        ".json": "application/json",
        ".bin": "application/octet-stream",
        ".mp4": "video/mp4",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }

    # Upload all files
    files = list(data_dir.rglob("*"))
    files = [f for f in files if f.is_file()]
    logger.info("Uploading %d files to R2 bucket '%s' under '%s/'", len(files), bucket, share_id)

    for filepath in files:
        relative = filepath.relative_to(data_dir)
        key = f"{share_id}/{relative}"
        content_type = content_types.get(filepath.suffix.lower(), "application/octet-stream")

        s3.upload_file(
            str(filepath),
            bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )

    share_url = f"{viewer_url}/?demo={share_id}"
    logger.info("Upload complete. Share URL: %s", share_url)

    if public_url:
        logger.info("Data URL: %s/%s/", public_url, share_id)

    return share_url
