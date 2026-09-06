# ============================================================
# PACKSURE BACKEND
# OCR + FIELD EXTRACTION + COMPLIANCE ANALYSIS
# ============================================================

import re
import cv2
import numpy as np
import pytesseract

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from rules import run_compliance_check


# ============================================================
# TESSERACT CONFIGURATION
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="PackSure API",
    description="AI-Assisted Legal Metrology Compliance Platform",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "message": "PackSure Backend is running",
        "status": "online"
    }


# ============================================================
# NORMALIZE OCR TEXT
# ============================================================

def normalize_text(text):

    if not text:
        return ""

    text = text.replace("\r", "\n")

    # Normalize spaces but preserve new lines
    text = re.sub(r"[ \t]+", " ", text)

    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ============================================================
# GENERIC RESULT
# ============================================================

def empty_result():
    return {
        "value": None,
        "confidence": 0.0
    }


# ============================================================
# LICENSE NUMBER
# ============================================================

def extract_license(text):

    patterns = [

        r"\bLIC\.?\s*NO\.?\s*[:\-]?\s*([0-9]{8,20})",

        r"\bLICENSE\s*NO\.?\s*[:\-]?\s*([0-9]{8,20})",

        r"\bLIC\s*NO\s*[:\-]?\s*([0-9]{8,20})"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            return {
                "value": match.group(1),
                "confidence": 0.95
            }

    return empty_result()


# ============================================================
# MARKETED BY
# ============================================================

def extract_marketed_by(text):

    patterns = [

        r"MARKETED\s+BY\s*[:\-]?\s*([A-Z0-9&., ]+)",

        r"MARKETED\s+BY\s*[:\-]?\s*([^\n]+)"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if not match:
            continue

        value = match.group(1).strip()

        # Remove trailing punctuation
        value = re.sub(r"[,:;\-]+$", "", value).strip()

        # Prevent address from becoming the company name
        value = re.split(
            r"\n|ROAD|RD\.|STREET|ST\.|KOLKATA|CHENNAI|MUMBAI|DELHI",
            value,
            flags=re.IGNORECASE
        )[0].strip()

        if len(value) > 2:

            return {
                "value": value,
                "confidence": 0.85
            }

    return empty_result()


# ============================================================
# MRP
# ============================================================

def extract_mrp(text):

    patterns = [

        # MRP Rs. 50
        r"\bM\.?\s*R\.?\s*P\.?\s*(?:RS\.?|INR|₹)?\s*[:\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)",

        # MRP: Rs. 50
        r"\bMRP\s*[:\-]\s*(?:RS\.?|INR|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)",

        # MRP Rs. 50
        r"\bMRP\s+RS\.?\s*([0-9]+(?:\.[0-9]{1,2})?)",

        # Rs. 50 near MRP
        r"\bMRP\b.{0,20}?(?:RS\.?|INR|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE | re.DOTALL
        )

        if match:

            value = match.group(1)

            return {
                "value": f"Rs. {value}",
                "confidence": 0.90
            }

    return empty_result()


# ============================================================
# NET WEIGHT / NET CONTENT
# ============================================================

def extract_net_weight(text):

    patterns = [

        # NET WEIGHT: 500 g
        r"\bNET\s+WEIGHT\s*[:\-]?\s*"
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(g|kg|mg|ml|l)",

        # NET WEIGHT: newline 500 g
        r"\bNET\s+WEIGHT\s*[:\-]?\s*"
        r".{0,30}?"
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(g|kg|mg|ml|l)",

        # NET WT: 500 g
        r"\bNET\s+WT\.?\s*[:\-]?\s*"
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(g|kg|mg|ml|l)",

        # NET CONTENT: 500 g
        r"\bNET\s+CONTENT\s*[:\-]?\s*"
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(g|kg|mg|ml|l)"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE | re.DOTALL
        )

        if match:

            quantity = match.group(1)
            unit = match.group(2).lower()

            return {
                "value": f"{quantity} {unit}",
                "confidence": 0.88
            }

    return empty_result()


# ============================================================
# BATCH NUMBER
# ============================================================

def extract_batch(text):

    patterns = [

        r"\bBATCH\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*"
        r"([A-Z0-9][A-Z0-9\/\-_]{1,})",

        r"\bBATCH\s*(?:NO\.?|NUMBER)?\s+"
        r"([A-Z0-9][A-Z0-9\/\-_]{1,})",

        r"\bLOT\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*"
        r"([A-Z0-9][A-Z0-9\/\-_]{1,})"

    ]

    invalid_values = {
        "PKD",
        "USE",
        "BY",
        "STORE",
        "STOREINA",
        "NET",
        "WEIGHT",
        "MRP"
    }

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if not match:
            continue

        value = match.group(1).strip()

        if value.upper() in invalid_values:
            continue

        # Batch numbers should normally contain a digit
        if not re.search(r"\d", value):
            continue

        return {
            "value": value,
            "confidence": 0.80
        }

    return empty_result()


# ============================================================
# PKD / PACKED DATE
# ============================================================

def extract_pkd(text):

    patterns = [

        # PKD: 08/2026
        r"\bPKD\.?\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{2,4})",

        # PKD: 08/08/2026
        r"\bPKD\.?\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})",

        # PKD: AUG 2026
        r"\bPKD\.?\s*[:\-]?\s*"
        r"([A-Z]{3,9}\s+[0-9]{4})"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            value = match.group(1).strip()

            return {
                "value": value,
                "confidence": 0.85
            }

    return empty_result()


# ============================================================
# USE BY / BEST BEFORE / EXPIRY
# ============================================================

def extract_use_by(text):

    patterns = [

        # USE BY: 02/2027
        r"\bUSE\s+BY\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{4})",

        # USE BY: 02/02/2027
        r"\bUSE\s+BY\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})",

        # BEST BEFORE: 02/2027
        r"\bBEST\s+BEFORE\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{4})",

        # BEST BEFORE: 02/02/2027
        r"\bBEST\s+BEFORE\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})",

        # EXPIRY: 02/2027
        r"\bEXP(?:IRY)?\.?\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{4})",

        # EXPIRY: 02/02/2027
        r"\bEXP(?:IRY)?\.?\s*[:\-]?\s*"
        r"([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            return {
                "value": match.group(1),
                "confidence": 0.85
            }

    return empty_result()


# ============================================================
# DATE EXTRACTION
# ============================================================

def extract_dates(text):

    patterns = [

        r"\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b",

        r"\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b",

        r"\b\d{1,2}[\/\-]\d{4}\b",

        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
        r"\s+\d{4}\b"

    ]

    dates = []

    for pattern in patterns:

        matches = re.findall(
            pattern,
            text,
            re.IGNORECASE
        )

        dates.extend(matches)

    return list(dict.fromkeys(dates))


# ============================================================
# EXTRACT ALL FIELDS
# ============================================================

def extract_fields(text):

    return {

        "license_no":
            extract_license(text),

        "marketed_by":
            extract_marketed_by(text),

        "mrp":
            extract_mrp(text),

        "net_weight":
            extract_net_weight(text),

        "batch_no":
            extract_batch(text),

        "pkd":
            extract_pkd(text),

        "use_by":
            extract_use_by(text)

    }


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess_images(image_bytes):

    image_array = np.frombuffer(
        image_bytes,
        np.uint8
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR
    )

    if image is None:

        raise ValueError(
            "Unable to read uploaded image."
        )

    # --------------------------------------------------------
    # Original grayscale
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    # --------------------------------------------------------
    # Resize 3x
    # --------------------------------------------------------

    resized = cv2.resize(
        gray,
        None,
        fx=3,
        fy=3,
        interpolation=cv2.INTER_CUBIC
    )

    # --------------------------------------------------------
    # Slight denoising
    # --------------------------------------------------------

    denoised = cv2.GaussianBlur(
        resized,
        (3, 3),
        0
    )

    # --------------------------------------------------------
    # Contrast enhancement
    # --------------------------------------------------------

    enhanced = cv2.equalizeHist(
        denoised
    )

    # --------------------------------------------------------
    # OTSU threshold
    # --------------------------------------------------------

    _, threshold = cv2.threshold(
        enhanced,
        0,
        255,
        cv2.THRESH_BINARY +
        cv2.THRESH_OTSU
    )

    # --------------------------------------------------------
    # Adaptive threshold
    # --------------------------------------------------------

    adaptive = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11
    )

    return [
        resized,
        enhanced,
        threshold,
        adaptive
    ]


# ============================================================
# MULTI-PASS OCR
# ============================================================

def run_multi_pass_ocr(image_bytes):

    images = preprocess_images(
        image_bytes
    )

    results = []

    # Different PSM modes work better for different layouts
    psm_modes = [
        6,   # Uniform block of text
        11,  # Sparse text
        12   # Sparse text with OSD
    ]

    for image in images:

        for psm in psm_modes:

            try:

                text = pytesseract.image_to_string(
                    image,
                    config=f"--oem 3 --psm {psm}"
                )

                if text and text.strip():

                    results.append(
                        text.strip()
                    )

            except Exception as error:

                print(
                    f"OCR pass failed (PSM {psm}):",
                    error
                )

    return results


# ============================================================
# COMBINE OCR RESULTS
# ============================================================

def combine_ocr_results(results):

    if not results:
        return ""

    unique_lines = []
    seen = set()

    for result in results:

        for line in result.splitlines():

            line = line.strip()

            if not line:
                continue

            # Normalize for duplicate detection
            key = re.sub(
                r"\s+",
                " ",
                line.lower()
            )

            if key in seen:
                continue

            seen.add(key)
            unique_lines.append(line)

    combined = "\n".join(
        unique_lines
    )

    return normalize_text(
        combined
    )


# ============================================================
# UPLOAD ENDPOINT
# ============================================================

@app.post("/upload")
async def upload_product(
    file: UploadFile = File(...)
):

    # --------------------------------------------------------
    # Validate file
    # --------------------------------------------------------

    if not file.content_type:

        return {
            "error":
                "File type could not be determined."
        }

    if not file.content_type.startswith(
        "image/"
    ):

        return {
            "error":
                "Please upload an image file."
        }

    # --------------------------------------------------------
    # Read image
    # --------------------------------------------------------

    image_bytes = await file.read()

    if not image_bytes:

        return {
            "error":
                "Uploaded image is empty."
        }

    # --------------------------------------------------------
    # OCR
    # --------------------------------------------------------

    try:

        ocr_results = run_multi_pass_ocr(
            image_bytes
        )

        extracted_text = combine_ocr_results(
            ocr_results
        )

    except Exception as error:

        print(
            "OCR Error:",
            error
        )

        return {
            "error":
                "OCR processing failed.",

            "details":
                str(error)
        }

    # --------------------------------------------------------
    # Extract fields
    # --------------------------------------------------------

    fields = extract_fields(
        extracted_text
    )

    # --------------------------------------------------------
    # Date detection
    # --------------------------------------------------------

    dates_detected = extract_dates(
        extracted_text
    )

    fields["dates_detected"] = {

        "value":
            dates_detected,

        "confidence":
            0.80
            if dates_detected
            else 0.0

    }

    # --------------------------------------------------------
    # Compliance analysis
    # --------------------------------------------------------

    compliance = run_compliance_check(
        fields
    )

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {

        "filename":
            file.filename,

        "content_type":
            file.content_type,

        "extracted_text":
            extracted_text,

        "fields":
            fields,

        "compliance":
            compliance

    }


# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )