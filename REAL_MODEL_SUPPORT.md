# Real-Model Support — Feature Summary

## Overview
Added comprehensive 3D model support to the garage system, allowing users to load custom GLTF/GLB models for each car with full metadata tracking, orientation controls, and automatic wheel detection.

## Features Implemented

### 1. Model Metadata Storage
- **Author name**: Track who created the model
- **License**: Record licensing terms (CC-BY, CC-BY-SA, etc.)
- **Source URL**: Link to original model source
- Displayed under each car slot: `model: author (license)`
- Full credits shown in About panel

### 2. Sketchfab Search Integration
Each car slot includes a 🔍 "Find model" button that opens a curated Sketchfab search in a new tab:
- **Clio**: `renault clio rs` (downloadable only)
- **Defender**: `land rover defender 110`
- **Tesla**: `tesla model 3`
- **GT3**: `porsche 911 gt3 992`
- **Caterham**: `caterham seven`
- **RS 2.7**: `porsche 911 carrera rs 2.7`

All searches filtered to `downloadable=true` for legal use.

### 3. Model Loading
- **File formats**: GLB, GLTF
- **Drag & drop**: Drop model files directly onto car preview
- **File picker**: 📁 button to browse for models
- **Auto-normalization**: Models automatically scaled and centered to fit car dimensions
- **Triangle counting**: Reports model complexity on load

### 4. Heavy Model Warning
- Models exceeding 200,000 triangles trigger a warning toast
- Message: "Heavy model, may lag" / "Тяжёлая модель, возможны задержки"
- Model still loads despite warning (user choice)

### 5. Orientation Controls
- **↺ / ↻ buttons**: Rotate model in 90° increments around Y-axis
- **Visual feedback**: Preview canvas shows rotation in real-time
- **Persistent**: Rotation saved per car configuration

### 6. Automatic Wheel Detection
- Scans model hierarchy for nodes containing: `wheel`, `tyre`, `tire`, `rim`
- Detected wheels can be animated independently (spinning with vehicle speed)
- Wheel count reported on load (e.g., "4 wheels detected")

### 7. Inline Metadata Form
After loading a model, a form appears asking for:
- Author name
- License type
- Source URL
- **Skip button**: Prefills "unknown" for all fields
- **Save button**: Stores metadata with car configuration

### 8. Visual Indicators
- **3D badge**: Green "3D" text appears on preview when custom model loaded
- **Model info line**: Shows `model: author (license)` below preview
- **Placeholder**: Shows `model: —` when no custom model loaded

## Technical Implementation

### New Files
- **`src/modelLoader.ts`**: GLTF/GLB loader with wheel detection
  - `loadModel(file)`: Parse and analyze 3D model
  - `rotateModel(model, degrees)`: Apply Y-axis rotation
  - `animateWheels(wheels, speed, deltaTime)`: Spin detected wheels
  - `normalizeModel(model, targetSize)`: Scale and center model

### Modified Files
- **`src/cars.ts`**: 
  - Added `modelAuthor`, `modelLicense`, `modelSource`, `modelRotation`, `customModelLoaded` fields
  - Added `SKETCHFAB_SEARCH_URLS` constant with per-car search links
  
- **`src/i18n.ts`**: 
  - Added translations for model-related UI strings
  - New keys: `model`, `unknown`, `findModel`, `rotateModel`, `modelCredits`, `modelAuthor`, `modelLicense`, `modelSource`, `heavyModel`, `enterModelInfo`, `skip`, `save`

- **`src/App.tsx`**: 
  - Enhanced `CarPreview` component with model controls
  - Added drag-drop handlers for model files
  - Integrated model loader with triangle counting
  - Added inline metadata form
  - Wired up Sketchfab search links

## User Workflow

### Finding a Model
1. Click 🔍 button on car slot
2. Sketchfab search opens in new tab with pre-filled query
3. Browse and download a model (GLB/GLTF format)

### Loading a Model
**Option A: Drag & Drop**
1. Drag GLB/GLTF file onto car preview
2. Model loads and normalizes automatically
3. Metadata form appears

**Option B: File Picker**
1. Click 📁 button on car slot
2. Select GLB/GLTF file
3. Model loads and normalizes automatically
4. Metadata form appears

### Entering Metadata
1. Fill in author, license, source fields
2. Click "Save" to store metadata
3. Or click "Skip" to use "unknown" defaults
4. Model info line updates: `model: John Doe (CC-BY)`

### Adjusting Orientation
1. Click ↺ to rotate -90° (counter-clockwise)
2. Click ↻ to rotate +90° (clockwise)
3. Preview updates immediately
4. Rotation persists across sessions

### Replacing a Model
1. Click 📁 button again
2. Select new model file
3. Old model replaced, new metadata form appears
4. Previous metadata cleared

## Performance Considerations

### Triangle Count Thresholds
- **< 50k triangles**: Smooth performance, no warnings
- **50k - 200k triangles**: Acceptable, may show warning on low-end devices
- **> 200k triangles**: Warning shown, user can proceed at own risk

### Memory Management
- Models loaded via `URL.createObjectURL()` for efficient memory use
- URLs revoked after loading to prevent leaks
- Only one custom model active per car at a time

### Rendering
- Custom models integrated into existing Three.js scene
- Share same lighting and materials as procedural cars
- Wheel animation synchronized with vehicle speed

## Legal & Attribution

### License Requirements
- Users responsible for ensuring model licenses permit use
- Sketchfab searches filtered to `downloadable=true`
- Common acceptable licenses: CC-BY, CC-BY-SA, CC0, Public Domain

### Attribution Display
- Model credits shown in About panel
- Format: `Car Name: Author (License) - Source URL`
- Helps users comply with attribution requirements

## Future Enhancements (Not Implemented)

### Potential Additions
- **Texture swapping**: Apply custom paint jobs to loaded models
- **LOD system**: Automatically generate lower-detail versions for performance
- **Model marketplace**: Integrated browsing within app
- **Undo/redo**: Track model changes with history
- **Batch operations**: Apply settings to multiple cars at once
- **Export configuration**: Save garage setup with model references

## Testing Checklist

- [x] Load GLB model via drag-drop
- [x] Load GLTF model via file picker
- [x] Heavy model warning (>200k triangles)
- [x] Rotate model ±90°
- [x] Metadata form appears after load
- [x] Skip button prefills "unknown"
- [x] Save button stores metadata
- [x] Model info line displays correctly
- [x] Sketchfab search opens in new tab
- [x] 3D badge appears on loaded models
- [x] Wheel detection reports count
- [x] Model normalization (scale/center)
- [x] Rotation persists in preview
- [x] RU/EN translations work
- [x] Build succeeds without errors

## Known Limitations

1. **Wheel animation**: Detected wheels rotate but don't steer
2. **Material override**: Custom model materials replaced with car paint color
3. **No undo**: Can't revert to previous model without re-loading
4. **Single model per car**: Can't layer multiple models
5. **No texture preview**: Can't see textures before loading
6. **File size**: No limit enforced, relies on triangle count warning

## Browser Compatibility

- **Chrome/Edge**: Full support (WebGL 2.0, GLTF loader)
- **Firefox**: Full support
- **Safari**: Full support (Safari 15+)
- **Mobile**: Works but drag-drop may be less convenient

## File Format Support

### Supported
- **GLB**: Binary GLTF (recommended, single file)
- **GLTF**: JSON + external binaries/textures

### Not Supported
- **FBX**: Would require additional loader
- **OBJ**: No PBR materials
- **USD/USDZ**: Apple format, not widely used
- **Blend**: Native Blender format

## Conclusion

Real-model support transforms the garage from procedural-only to a hybrid system where users can bring their own 3D assets while maintaining the app's structured approach to vehicle dynamics. The metadata system ensures proper attribution, while the Sketchfab integration provides a legal pathway to find quality models.

The feature balances power (full model customization) with simplicity (drag-drop, auto-normalization, guided metadata entry), making it accessible to both casual users and 3D artists.
