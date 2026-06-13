## Goal

Resolve the "Bloodwork.pdf: documentId and key are required" error seen on the **published** site (`your-doc-haven.lovable.app/upload`).

## What's already true

The current **preview** code already sends the correct fields. In `src/routes/_authenticated/upload.tsx` the process step is:

```ts
const presign = await apiClient.presign({ fileName, fileType, fileSize });
await uploadToPresignedUrl(presign.uploadUrl, file, onProgress);
await apiClient.process({
  documentId: presign.documentId,
  key: presign.key,
  fileName: file.name,
});
```

And `presign` returns `{ uploadUrl, documentId, key }` per your spec. This is the fix from our last change. The published build predates it, which is exactly why the live site still errors with "documentId and key are required."

## Plan

1. **Verify in preview first**
   - Sign in on the preview URL and upload a test PDF.
   - Confirm `/presign` returns `documentId` + `key`, the S3 PUT succeeds, and `/process` is called with all three fields and returns success (no "documentId and key are required" error).
   - If preview reproduces the error, the presign response shape differs from the spec — I'll inspect the actual response and adjust how `documentId`/`key` are read before doing anything else.

2. **If preview works, publish**
   - Push the current build live so the published site picks up the corrected `/process` payload.
   - Confirm the same upload on the published URL succeeds afterward.

## Notes

- No code change is expected if preview verifies cleanly — this is primarily a publish to ship the existing fix.
- The only scenario requiring a code edit is if `/presign` actually nests `documentId`/`key` (e.g. under a `fields` object) rather than returning them at the top level; in that case I'll update the read path in `upload.tsx` / `api.ts`.
