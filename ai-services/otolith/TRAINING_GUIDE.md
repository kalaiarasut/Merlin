# Otolith Age Estimation Model - Training Guide

This guide walks you through training a deep learning model for automated otolith age estimation.

## Prerequisites

### 1. Hardware Requirements
- **Minimum**: CPU with 8GB RAM (slow training)
- **Recommended**: NVIDIA GPU with 6GB+ VRAM (GTX 1060 or better)
- **Optimal**: RTX 3080+ or cloud GPU (AWS, Google Colab, etc.)

### 2. Install Dependencies

```bash
cd ai-services

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install PyTorch with CUDA support
# For CUDA 11.8 (check your CUDA version with: nvidia-smi)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Or CPU-only version
pip install torch torchvision

# Install other dependencies
pip install albumentations tensorboard pandas scikit-learn matplotlib pillow
```

## Step 1: Prepare Your Dataset

### Option A: Folder Structure (Recommended)

Organize your labeled otolith images like this:

```
data/
└── otoliths/
    ├── train/           # 70-80% of your data
    │   ├── age_01/
    │   │   ├── fish001_otolith.jpg
    │   │   ├── fish002_otolith.jpg
    │   │   └── ...
    │   ├── age_02/
    │   ├── age_03/
    │   ├── age_04/
    │   ├── age_05/
    │   └── ... (up to max age)
    ├── val/             # 10-15% of your data
    │   ├── age_01/
    │   ├── age_02/
    │   └── ...
    └── test/            # 10-15% of your data
        ├── age_01/
        ├── age_02/
        └── ...
```

### Option B: CSV File

Create a CSV file with columns:
```csv
image_path,age,split
images/sample001.jpg,5,train
images/sample002.jpg,7,train
images/sample003.jpg,3,val
...
```

### Data Requirements

- **Minimum**: 100-200 images total (won't be very accurate)
- **Good**: 500-1000 images (reasonable accuracy)
- **Ideal**: 2000+ images (production-quality accuracy)

### Image Preparation Tips

1. **Consistent orientation** - All otoliths should face the same direction
2. **Clean background** - Black or uniform background works best
3. **Good lighting** - Even illumination, no shadows
4. **High resolution** - 1000x1000 pixels or higher
5. **Include variety** - Different species, sizes, image conditions

## Step 2: Train the Model

### Basic Training

```bash
cd ai-services/otolith

python train_model.py \
    --data_dir ../data/otoliths \
    --model efficientnet_b0 \
    --epochs 50 \
    --batch_size 32
```

### With Custom Options

```bash
python train_model.py \
    --data_dir ../data/otoliths \
    --model efficientnet_b2 \
    --task regression \
    --epochs 100 \
    --batch_size 16 \
    --lr 0.0001 \
    --image_size 384 \
    --output_dir ../models
```

### Model Options

| Model | Accuracy | Speed | GPU Memory |
|-------|----------|-------|------------|
| `efficientnet_b0` | Good | Fast | ~4GB |
| `efficientnet_b2` | Better | Medium | ~6GB |
| `resnet50` | Good | Fast | ~4GB |
| `vit_b_16` | Best | Slow | ~8GB |

### Task Types

- `regression` - Predicts continuous age (e.g., 5.3 years) - usually better
- `classification` - Predicts discrete age class (e.g., 5 years)

## Step 3: Monitor Training

### Using TensorBoard

```bash
# In a new terminal
tensorboard --logdir models/

# Open browser to http://localhost:6006
```

Watch for:
- **Training loss** should decrease
- **Validation loss** should decrease (if it increases, you're overfitting)
- **MAE (Mean Absolute Error)** - lower is better (target: < 1.0 years)
- **R² score** - closer to 1.0 is better (target: > 0.85)

## Step 4: Evaluate the Model

After training, you'll find in the output directory:
- `checkpoint_best.pt` - Best model weights
- `checkpoint_latest.pt` - Latest checkpoint
- `config.json` - Training configuration
- `logs/` - TensorBoard logs

### Test on New Images

```python
from train_model import load_model, predict_single_image, Config

# Load model
model = load_model("models/run_YYYYMMDD_HHMMSS/checkpoint_best.pt")
config = Config()

# Predict
age, confidence = predict_single_image(model, "path/to/otolith.jpg", config)
print(f"Predicted age: {age} years (confidence: {confidence:.1%})")
```

## Step 5: Integrate with the Application

Once you have a trained model, update the otolith analyzer to use it:

```python
# In otolith_analyzer.py, update the OtolithAnalyzer class:

class OtolithAnalyzer:
    def __init__(self):
        # Load deep learning model
        from train_model import load_model
        self.dl_model = load_model("models/checkpoint_best.pt")
        
    def analyze_age(self, image_path, method="deep_learning"):
        if method == "deep_learning" and self.dl_model:
            age, confidence = self.dl_model.predict_age(image)
            return {
                "estimated_age": age,
                "confidence": confidence,
                "method": "deep_learning"
            }
        else:
            # Fall back to classical methods
            ...
```

## Troubleshooting

### CUDA Out of Memory
- Reduce `--batch_size` (try 16, 8, or 4)
- Use a smaller model (`efficientnet_b0` instead of `b2`)
- Reduce `--image_size` to 224 or 192

### Training Loss Not Decreasing
- Increase learning rate: `--lr 0.001`
- Check your data labels are correct
- Ensure images are loading properly

### Overfitting (val loss increases while train loss decreases)
- Add more training data
- Use more augmentation
- Reduce model size
- Add early stopping

### Poor Accuracy
- Need more training data
- Check label quality (have expert verify)
- Try different model architectures
- Increase training epochs

## Example Results

With a well-prepared dataset of ~1000 images:

| Metric | Typical Value | Good Value |
|--------|---------------|------------|
| MAE (years) | 1.5 - 2.0 | < 1.0 |
| RMSE (years) | 2.0 - 3.0 | < 1.5 |
| R² score | 0.7 - 0.8 | > 0.85 |

Human expert agreement is typically around 1-2 years MAE, so a model with MAE < 1.5 is comparable to human performance.

## Cloud Training Options

If you don't have a GPU:

### Google Colab (Free)
1. Upload your data to Google Drive
2. Open Colab notebook
3. Enable GPU: Runtime → Change runtime type → GPU
4. Mount Drive and run training

### AWS/Azure/GCP
- Use spot instances for cheaper training
- Typical cost: $0.50-2.00/hour for GPU instances
- Training time: 1-4 hours for 50 epochs with 1000 images

## Next Steps

1. Collect and label more otolith images
2. Train initial model
3. Evaluate on test set
4. Fine-tune and iterate
5. Deploy to production
