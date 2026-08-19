/**
 * assetUpload — shared browser-side helper for uploading an image or video
 * file to Salesforce and getting back { assetId, url }. Reads the File as
 * base64 and hands it to WebsuiteAssetController. Used by imageUploader/
 * videoUploader and by sections that upload inline (e.g. gallery tiles).
 * Leaf module.
 */
import uploadImage from '@salesforce/apex/WebsuiteAssetController.uploadImage';
import uploadVideo from '@salesforce/apex/WebsuiteAssetController.uploadVideo';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB skeleton cap
// Video files run bigger than images, but base64-encoding a file inflates it
// ~33% before it ever reaches Apex, and synchronous Apex has a modest heap
// ceiling — this cap is a deliberately conservative "short clip" size, not a
// hard platform limit, chosen to stay well clear of that ceiling rather than
// discovered by hitting it in production.
const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // 15MB skeleton cap

function readAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
    });
}

/** Resolve with { assetId, url } or reject with an Error. */
export function uploadFile(file, siteId) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file selected.'));
            return;
        }
        if (!/^image\//.test(file.type)) {
            reject(new Error('Please choose an image file.'));
            return;
        }
        if (file.size > MAX_BYTES) {
            reject(new Error('Image must be under 5MB.'));
            return;
        }
        readAsBase64(file)
            .then((base64) => uploadImage({ fileName: file.name, base64Data: base64, siteId: siteId || null }))
            .then((res) => resolve(res))
            .catch((e) => reject(e instanceof Error ? e : new Error((e && (e.body?.message || e.message)) || 'Upload failed.')));
    });
}

/** Video counterpart to uploadFile above — same contract, its own type/size limits. */
export function uploadVideoFile(file, siteId) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file selected.'));
            return;
        }
        if (!/^video\//.test(file.type)) {
            reject(new Error('Please choose a video file.'));
            return;
        }
        if (file.size > MAX_VIDEO_BYTES) {
            reject(new Error('Video must be under 15MB — trim the clip or compress it first.'));
            return;
        }
        readAsBase64(file)
            .then((base64) => uploadVideo({ fileName: file.name, base64Data: base64, siteId: siteId || null }))
            .then((res) => resolve(res))
            .catch((e) => reject(e instanceof Error ? e : new Error((e && (e.body?.message || e.message)) || 'Upload failed.')));
    });
}