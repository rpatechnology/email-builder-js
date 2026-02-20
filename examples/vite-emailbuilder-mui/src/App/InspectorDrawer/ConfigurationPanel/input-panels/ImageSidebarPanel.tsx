import React, { useRef, useState } from 'react';
import { ZodError } from 'zod';

import {
  VerticalAlignBottomOutlined,
  VerticalAlignCenterOutlined,
  VerticalAlignTopOutlined,
} from '@mui/icons-material';
import { Alert, Box, Button, CircularProgress, Divider, Stack, ToggleButton, Typography } from '@mui/material';
import { ImageProps, ImagePropsSchema } from '@usewaypoint/block-image';

import BaseSidebarPanel from './helpers/BaseSidebarPanel';
import RadioGroupInput from './helpers/inputs/RadioGroupInput';
import TextDimensionInput from './helpers/inputs/TextDimensionInput';
import TextInput from './helpers/inputs/TextInput';
import MultiStylePropertyPanel from './helpers/style-inputs/MultiStylePropertyPanel';

// ---------------------------------------------------------------------------
// Upload config — set these in your .env file at the root of the example app:
//   VITE_UPLOAD_WORKER_URL = https://your-worker.your-subdomain.workers.dev
//   VITE_UPLOAD_API_KEY    = your-secret-api-key
//
// If either variable is missing the upload button is hidden and only the
// manual URL input is shown — fully backwards compatible.
// ---------------------------------------------------------------------------
const WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL as string | undefined;
const API_KEY = import.meta.env.VITE_UPLOAD_API_KEY as string | undefined;
const UPLOAD_ENABLED = Boolean(WORKER_URL && API_KEY);

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'error'; message: string };

type ImageSidebarPanelProps = {
  data: ImageProps;
  setData: (v: ImageProps) => void;
};

export default function ImageSidebarPanel({ data, setData }: ImageSidebarPanelProps) {
  const [, setErrors] = useState<ZodError | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateData = (d: unknown) => {
    const res = ImagePropsSchema.safeParse(d);
    if (res.success) {
      setData(res.data);
      setErrors(null);
    } else {
      setErrors(res.error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !WORKER_URL || !API_KEY) return;

    setUploadState({ status: 'uploading' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'X-Upload-Api-Key': API_KEY },
        body: formData,
      });

      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? `Upload failed (${response.status})`);
      }

      // Populate the Source URL field with the uploaded image URL
      updateData({ ...data, props: { ...data.props, url: result.url } });
      setUploadState({ status: 'idle' });
    } catch (err) {
      setUploadState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    } finally {
      // Reset so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <BaseSidebarPanel title="Image block">
      {/* ------------------------------------------------------------------ */}
      {/* Image upload — only shown when VITE_UPLOAD_WORKER_URL is configured */}
      {/* ------------------------------------------------------------------ */}
      {UPLOAD_ENABLED && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Upload image
          </Typography>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <Button
            variant="outlined"
            size="small"
            fullWidth
            disabled={uploadState.status === 'uploading'}
            onClick={() => fileInputRef.current?.click()}
            startIcon={uploadState.status === 'uploading' ? <CircularProgress size={14} /> : undefined}
          >
            {uploadState.status === 'uploading' ? 'Uploading…' : 'Choose file'}
          </Button>

          {uploadState.status === 'error' && (
            <Alert severity="error" sx={{ mt: 1 }} onClose={() => setUploadState({ status: 'idle' })}>
              {uploadState.message}
            </Alert>
          )}

          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">
              or enter a URL below
            </Typography>
          </Divider>
        </Box>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Existing fields — unchanged                                         */}
      {/* ------------------------------------------------------------------ */}
      <TextInput
        label="Source URL"
        defaultValue={data.props?.url ?? ''}
        onChange={(v) => {
          const url = v.trim().length === 0 ? null : v.trim();
          updateData({ ...data, props: { ...data.props, url } });
        }}
      />
      <TextInput
        label="Alt text"
        defaultValue={data.props?.alt ?? ''}
        onChange={(alt) => updateData({ ...data, props: { ...data.props, alt } })}
      />
      <TextInput
        label="Click through URL"
        defaultValue={data.props?.linkHref ?? ''}
        onChange={(v) => {
          const linkHref = v.trim().length === 0 ? null : v.trim();
          updateData({ ...data, props: { ...data.props, linkHref } });
        }}
      />
      <Stack direction="row" spacing={2}>
        <TextDimensionInput
          label="Width"
          defaultValue={data.props?.width}
          onChange={(width) => updateData({ ...data, props: { ...data.props, width } })}
        />
        <TextDimensionInput
          label="Height"
          defaultValue={data.props?.height}
          onChange={(height) => updateData({ ...data, props: { ...data.props, height } })}
        />
      </Stack>

      <RadioGroupInput
        label="Alignment"
        defaultValue={data.props?.contentAlignment ?? 'middle'}
        onChange={(contentAlignment) => updateData({ ...data, props: { ...data.props, contentAlignment } })}
      >
        <ToggleButton value="top">
          <VerticalAlignTopOutlined fontSize="small" />
        </ToggleButton>
        <ToggleButton value="middle">
          <VerticalAlignCenterOutlined fontSize="small" />
        </ToggleButton>
        <ToggleButton value="bottom">
          <VerticalAlignBottomOutlined fontSize="small" />
        </ToggleButton>
      </RadioGroupInput>

      <MultiStylePropertyPanel
        names={['backgroundColor', 'textAlign', 'padding']}
        value={data.style}
        onChange={(style) => updateData({ ...data, style })}
      />
    </BaseSidebarPanel>
  );
}
