## Plan

1. **Reproduce the upload flow**
   - Use the preview to verify whether selecting multiple images displays one row or multiple rows before upload.
   - Check network calls during a multi-file upload to confirm whether the app sends one `presign/process` pair or one pair per file.

2. **Fix the upload queue behavior**
   - Keep the existing backend calls unchanged: `apiClient.presign()`, `uploadToPresignedUrl()`, and `apiClient.process()`.
   - Make the file picker and drag/drop handler always append every selected file to the existing queue instead of replacing the prior selection.
   - Ensure each queued file has its own stable ID, preview thumbnail, remove button, progress, status, and error state.

3. **Fix the post-upload document list if needed**
   - If the upload queue shows all files but the dashboard only shows one, inspect the list rendering and keying.
   - Adjust the document list so multiple uploaded records are visible instead of collapsing/replacing when returned data has duplicate or unstable IDs.

4. **Validate the result**
   - Confirm the upload page shows all selected images/files at once.
   - Confirm upload runs once per queued file and does not auto-navigate away.
   - Confirm the documents page can display multiple uploaded items after completion.

## Technical notes

- I will only touch the upload UI/listing code unless diagnostics show the frontend list is hiding successfully uploaded records.
- I will not change `src/lib/api.ts` or the API method signatures.