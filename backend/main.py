import os
import re
import time

import cv2
import numpy as np
import pytesseract

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from compliance import run_compliance_check


# ============================================================
# TESSERACT CONFIGURATION
# ============================================================

if os.name == "nt":
    windows_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    if os.path.exists(windows_tesseract):
        pytesseract.pytesseract.tesseract_cmd = windows_tesseract
else:
    pytesseract.pytesseract.tesseract_cmd = "tesseract"


# ============================================================
# FASTAPI
# ============================================================
app = FastAPI(
    title="ShieldX Compliance Intelligence",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://shieldx-compliance.vercel.app",
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
        "message": "ShieldX Backend is running",
        "status": "online",
    }


# ============================================================
# HELPERS
# ============================================================

def empty_result():
    return {
        "value": None,
        "confidence": 0,
    }


def clean_line(text):
    text = text.replace("\x0c", " ")
    text = re.sub(r"[\t ]+", " ", text)
    return text.strip()


def normalize_text(text):
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = text.replace("₹", " Rs. ")
    text = text.replace("—", "-")
    text = text.replace("–", "-")

    return text


def normalized_lines(text):
    text = normalize_text(text)

    lines = []

    for line in text.splitlines():
        line = clean_line(line)

        if line:
            lines.append(line)

    return lines


# ============================================================
# LICENSE NUMBER
# ============================================================

def extract_license(text):

    if not text:
        return empty_result()

    patterns = [

        r"\b(?:FSSAI|LICENCE|LICENSE|LIC\.?|LIC\s*NO\.?)"
        r"\s*(?:NO\.?|NUMBER|NUM)?\s*[:\-]?\s*"
        r"([0-9]{10,14})\b",

        r"\bFSSAI\b.{0,50}?([0-9]{10,14})\b",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE | re.DOTALL,
        )

        if match:

            value = match.group(1)

            if len(value) >= 10:

                return {
                    "value": value,
                    "confidence": 0.95,
                }

    # Safe fallback for long license-like numbers

    candidates = re.findall(
        r"\b[0-9]{10,14}\b",
        text,
    )

    if candidates:

        return {
            "value": candidates[0],
            "confidence": 0.70,
        }

    return empty_result()


# ============================================================
# MARKETED BY
# ============================================================

def extract_marketed_by(text):

    if not text:
        return empty_result()

    lines = normalized_lines(text)

    patterns = [

        r"(?:manufactured\s*(?:&|and)\s*marketed\s*by)"
        r"\s*[:\-]?\s*(.+)",

        r"(?:mfg\.?\s*(?:&|and)\s*mkt\.?\s*by)"
        r"\s*[:\-]?\s*(.+)",

        r"(?:manufactured\s*and\s*marketed\s*by)"
        r"\s*[:\-]?\s*(.+)",

        r"(?:marketed\s*by)"
        r"\s*[:\-]?\s*(.+)",

        r"(?:mfg\.?\s*by)"
        r"\s*[:\-]?\s*(.+)",
    ]

    for line in lines:

        for pattern in patterns:

            match = re.search(
                pattern,
                line,
                re.IGNORECASE,
            )

            if not match:
                continue

            value = match.group(1).strip()

            value = re.split(
                r"\b(?:MRP|NET\s*WT|N\.?\s*QTY|"
                r"B\.?\s*NO|BATCH|MFD|PKD|"
                r"PACKED|USE\s*BY|EXPIRY)\b",
                value,
                flags=re.IGNORECASE,
            )[0].strip(" :-.,;")

            if len(value) >= 2:

                return {
                    "value": value,
                    "confidence": 0.90,
                }

    return empty_result()


# ============================================================
# MRP
# ============================================================

def extract_mrp(text):

    """
    Extract MRP only when an actual price is explicitly
    associated with the MRP label.

    Accepted examples:

        MRP Rs. 20
        MRP Rs 20
        MRP INR 20
        MRP ₹20
        MRP: 20
        MRP - 20
        MRP 20

    If OCR only detects:

        MRP
        MRP Rs.

    without a real price, return NOT DETECTED.
    """

    if not text:
        return empty_result()

    normalized = normalize_text(text)

    patterns = [

        # MRP Rs. 50
        r"\bMRP\b\s*[:\-]?\s*"
        r"(?:RS\.?|INR)\s*[:\-]?\s*"
        r"([0-9]{1,6}(?:\.[0-9]{1,2})?)\b",

        # M.R.P Rs. 50
        r"\bM\.?\s*R\.?\s*P\.?\b\s*[:\-]?\s*"
        r"(?:RS\.?|INR)\s*[:\-]?\s*"
        r"([0-9]{1,6}(?:\.[0-9]{1,2})?)\b",

        # MRP: 50
        r"\bMRP\b\s*[:\-]\s*"
        r"([0-9]{1,6}(?:\.[0-9]{1,2})?)\b",

        # MRP 50
        r"\bMRP\b\s+"
        r"([0-9]{1,6}(?:\.[0-9]{1,2})?)\b",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            normalized,
            re.IGNORECASE,
        )

        if not match:
            continue

        value = match.group(1).strip()

        try:

            price = float(value)

            if price <= 0:
                continue

            return {
                "value": f"Rs. {value}",
                "confidence": 0.90,
            }

        except ValueError:
            continue

    return empty_result()


# ============================================================
# NET WEIGHT
# ============================================================

def extract_net_weight(text):

    """
    IMPORTANT:

    Net Weight is intentionally VERY strict.

    We only accept a weight when the numeric value is
    directly attached to the Net Weight / Net Qty label.

    Example accepted:

        NET WEIGHT: 500 g
        NET WT: 500 g
        NET QTY: 500 g
        N. WT.: 500 g
        N. QTY: 500 g

    We DO NOT search nearby OCR lines.

    Therefore:

        NET WEIGHT:
        8 ML

    will NOT automatically be accepted.

    This prevents random OCR text such as "8 ML"
    from being incorrectly classified as Net Weight.
    """

    if not text:
        return empty_result()

    lines = normalized_lines(text)

    weight_pattern = (
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(kg|kgs|g|gm|gms|mg|ml|l|ltr|litre|litres)\b"
    )

    direct_patterns = [

        # NET WEIGHT: 500 g
        r"\bNET\s*(?:WEIGHT|WT\.?)\b"
        r"\s*[:\-]\s*"
        + weight_pattern,

        # NET WT 500 g
        r"\bNET\s*(?:WEIGHT|WT\.?)\b"
        r"\s+"
        + weight_pattern,

        # N. WT.: 500 g
        r"\bN\.?\s*WT\.?\b"
        r"\s*[:\-]\s*"
        + weight_pattern,

        # N. QTY.: 500 g
        r"\bN\.?\s*QTY\.?\b"
        r"\s*[:\-]\s*"
        + weight_pattern,

        # NET QTY: 500 g
        r"\bNET\s*QTY\.?\b"
        r"\s*[:\-]\s*"
        + weight_pattern,
    ]

    for line in lines:

        for pattern in direct_patterns:

            match = re.search(
                pattern,
                line,
                re.IGNORECASE,
            )

            if not match:
                continue

            number = match.group(1)
            unit = match.group(2)

            return {
                "value": f"{number} {unit}",
                "confidence": 0.90,
            }

    # IMPORTANT:
    # No separate-line detection here.
    #
    # This prevents:
    #
    # NET WEIGHT:
    # 8 ML
    #
    # from being incorrectly extracted.

    return empty_result()


# ============================================================
# BATCH NUMBER
# ============================================================

def is_valid_batch_value(value):

    """
    Very strict batch validation.

    Reject OCR garbage such as:

        UI
        LO
        JN
        LJ
        NN
        NO
        NUMBER
        BATCH
        LOT

    A realistic batch code normally has stronger structure,
    such as:

        AB1234
        23AB91
        A12345
        LOT2025A
        B24-0198
    """

    if not value:
        return False

    value = value.strip(" .:-,;")

    if not value:
        return False

    cleaned = re.sub(
        r"[^A-Za-z0-9/_\-.]",
        "",
        value,
    )

    if not cleaned:
        return False

    lower = cleaned.lower()

    # Common OCR / label words
    rejected_words = {
        "no",
        "number",
        "batch",
        "lot",
        "bno",
        "batchno",
        "lotno",
        "na",
        "nil",
        "none",
    }

    if lower in rejected_words:
        return False

    # Reject very short OCR noise.
    if len(cleaned) < 4:
        return False

    # Maximum sensible batch length.
    if len(cleaned) > 30:
        return False

    has_letter = bool(re.search(r"[A-Za-z]", cleaned))
    has_digit = bool(re.search(r"[0-9]", cleaned))

    # Strongest rule:
    # Batch code should normally contain both letters and numbers.
    if has_letter and has_digit:
        return True

    # Allow a purely numeric batch only when reasonably long.
    if has_digit and not has_letter:
        digits_only = re.sub(r"\D", "", cleaned)

        if len(digits_only) >= 5:
            return True

    # Reject pure alphabetic OCR garbage.
    return False


def extract_batch(text):

    if not text:
        return empty_result()

    lines = normalized_lines(text)

    patterns = [
        r"\bB\.?\s*NO\.?\s*[:\-]\s*"
        r"([A-Za-z0-9][A-Za-z0-9/_\-.]{2,29})",

        r"\bBATCH\s*(?:NO\.?|NUMBER)"
        r"\s*[:\-]\s*"
        r"([A-Za-z0-9][A-Za-z0-9/_\-.]{2,29})",

        r"\bLOT\s*(?:NO\.?|NUMBER)"
        r"\s*[:\-]\s*"
        r"([A-Za-z0-9][A-Za-z0-9/_\-.]{2,29})",

        r"\bBATCH\s*[:\-]\s*"
        r"([A-Za-z0-9][A-Za-z0-9/_\-.]{2,29})",

        r"\bLOT\s*[:\-]\s*"
        r"([A-Za-z0-9][A-Za-z0-9/_\-.]{2,29})",
    ]

    for line in lines:
        for pattern in patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if not match:
                continue
            value = match.group(1).strip(" .:-,;")
            if is_valid_batch_value(value):
                return {"value": value, "confidence": 0.90}

    batch_label = re.compile(
        r"^\s*(?:"
        r"B\.?\s*NO\.?"
        r"|BATCH\s*(?:NO\.?|NUMBER)?"
        r"|LOT\s*(?:NO\.?|NUMBER)?"
        r")\s*[:\-]?\s*$",
        re.IGNORECASE,
    )

    for i, line in enumerate(lines):
        if not batch_label.search(line):
            continue
        if i + 1 >= len(lines):
            continue
        next_line = lines[i + 1].strip()
        candidate_match = re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9/_\-.]{2,29}",
            next_line,
        )
        if not candidate_match:
            continue
        value = candidate_match.group(0)
        if is_valid_batch_value(value):
            return {"value": value, "confidence": 0.80}

    return empty_result()


# ============================================================
# PACKED / MANUFACTURED DATE
# ============================================================

def extract_pkd(text):

    if not text:
        return empty_result()

    lines = normalized_lines(text)

    date_pattern = (
        r"([0-9]{1,2}"
        r"\s*[\/\-\.]\s*"
        r"[0-9]{1,2}"
        r"\s*[\/\-\.]\s*"
        r"[0-9]{2,4})"
    )

    patterns = [
        rf"\bP\.?\s*K\.?\s*D\.?\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        rf"\bPACK(?:ED|ING)\s*(?:ON|DATE)?\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        rf"\bM\.?\s*F\.?\s*D\.?\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        rf"\bMANUFACTURED\s*(?:ON|DATE)?\b"
        rf"\s*[:\-]?\s*{date_pattern}",
    ]

    for line in lines:
        for pattern in patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                return {"value": re.sub(r"\s+", "", match.group(1)), "confidence": 0.90}

    label_pattern = re.compile(
        r"\b(?:"
        r"PKD"
        r"|P\.?\s*K\.?\s*D"
        r"|MFD"
        r"|M\.?\s*F\.?\s*D"
        r"|PACKED\s*(?:ON|DATE)?"
        r"|MANUFACTURED\s*(?:ON|DATE)?"
        r")\b",
        re.IGNORECASE,
    )

    date_regex = re.compile(date_pattern, re.IGNORECASE)

    for i, line in enumerate(lines):
        if label_pattern.search(line):
            for next_line in lines[i:i + 4]:
                match = date_regex.search(next_line)
                if match:
                    return {"value": re.sub(r"\s+", "", match.group(1)), "confidence": 0.80}

    return empty_result()


# ============================================================
# USE BY / EXPIRY
# ============================================================

def extract_use_by(text):

    if not text:
        return empty_result()

    lines = normalized_lines(text)

    date_pattern = (
        r"([0-9]{1,2}"
        r"\s*[\/\-\.]\s*"
        r"[0-9]{1,2}"
        r"\s*[\/\-\.]\s*"
        r"[0-9]{2,4})"
    )

    patterns = [

        # USE BY
        rf"\bUSE\s*BY\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        # BEST BEFORE
        rf"\bBEST\s*BEFORE\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        # EXPIRY
        rf"\bEXP(?:IRY|IRES|\.)\b"
        rf"\s*[:\-]?\s*{date_pattern}",

        # EXPIRES ON
        rf"\bEXPIRES?\s*(?:ON|DATE)?\b"
        rf"\s*[:\-]?\s*{date_pattern}",
    ]

    for line in lines:

        for pattern in patterns:

            match = re.search(
                pattern,
                line,
                re.IGNORECASE,
            )

            if match:

                return {
                    "value": re.sub(r"\s+", "", match.group(1)),
                    "confidence": 0.90,
                }

    # Separate-line detection

    label_pattern = re.compile(
        r"\b(?:"
        r"USE\s*BY"
        r"|BEST\s*BEFORE"
        r"|EXP(?:IRY|IRES)?"
        r"|EXPIRES?"
        r")\b",
        re.IGNORECASE,
    )

    date_regex = re.compile(
        date_pattern,
        re.IGNORECASE,
    )

    for i, line in enumerate(lines):

        if label_pattern.search(line):

            for next_line in lines[i + 1:i + 4]:

                match = date_regex.search(
                    next_line
                )

                if match:

                    return {
                        "value": re.sub(r"\s+", "", match.group(1)),
                        "confidence": 0.80,
                    }

    return empty_result()


# ============================================================
# DATE DETECTION
# ============================================================

def extract_dates(text):

    if not text:

        return {
            "value": [],
            "confidence": 0,
        }

    patterns = [

        r"\b[0-9]{1,2}\s*[\/\-\.]\s*"
        r"[0-9]{1,2}\s*[\/\-\.]\s*"
        r"[0-9]{2,4}\b",

        r"\b[0-9]{1,2}\s*[\/\-\.]\s*"
        r"[A-Za-z]{3,9}\s*[\/\-\.]\s*"
        r"[0-9]{2,4}\b",
    ]

    found = []

    for pattern in patterns:

        matches = re.findall(
            pattern,
            text,
            re.IGNORECASE,
        )

        for value in matches:
            value = re.sub(r"\s+", "", value)

            if value not in found:
                found.append(value)

    return {
        "value": found,
        "confidence": 0.80 if found else 0,
    }


# ============================================================
# ALL FIELD EXTRACTION
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
            extract_use_by(text),
    }


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess_image(image):
    height, width = image.shape[:2]
    target_width = 1200
    if width < target_width:
        scale = target_width / width
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = cv2.resize(
            image,
            (new_width, new_height),
            interpolation=cv2.INTER_CUBIC,
        )
    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )
    return [
        gray,
    ]
# ============================================================
# OCR
# ============================================================

def run_ocr(image):

    variants = preprocess_image(
        image
    )
    psm_modes = [
        6,
    ]
    results = []

    results = []

    for variant_index, variant in enumerate(
        variants
    ):

        for psm in psm_modes:

            try:

                config = (
                    f"--oem 3 --psm {psm}"
                )

                text = pytesseract.image_to_string(
                    variant,
                    config=config,
                )

                if text and text.strip():

                    results.append(text)

                    print(
                        f"OCR pass "
                        f"variant={variant_index} "
                        f"psm={psm} "
                        f"chars={len(text)}"
                    )

            except Exception as exc:

                print(
                    f"OCR pass failed "
                    f"variant={variant_index} "
                    f"psm={psm}: {exc}"
                )

    combined = "\n".join(
        results
    )

    print(
        f"Total OCR characters: "
        f"{len(combined)}"
    )

    return combined
# ============================================================
# UPLOAD / ANALYSIS
# ============================================================

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...)
):

    if not file:

        raise HTTPException(
            status_code=400,
            detail="No file uploaded.",
        )

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
    }

    if file.content_type not in allowed_types:

        raise HTTPException(
            status_code=400,
            detail="Please upload a valid image.",
        )

    try:

        # ----------------------------------------------------
        # Check Tesseract
        # ----------------------------------------------------

        try:

            version = (
                pytesseract
                .get_tesseract_version()
            )

            print(
                f"Tesseract version: "
                f"{version}"
            )

        except Exception as exc:

            raise HTTPException(
                status_code=500,
                detail=(
                    "Tesseract OCR is not "
                    "available: "
                    f"{str(exc)}"
                ),
            )

        # ----------------------------------------------------
        # Read image
        # ----------------------------------------------------

        request_start = time.time()

        contents = await file.read()

        if not contents:

            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty.",
            )

        image_array = np.frombuffer(
            contents,
            dtype=np.uint8,
        )

        image = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR,
        )

        if image is None:

            raise HTTPException(
                status_code=400,
                detail="Unable to read uploaded image.",
            )

        print(
            f"Image received: "
            f"{image.shape[1]}x"
            f"{image.shape[0]}"
        )

        # ----------------------------------------------------
        # OCR
        # ----------------------------------------------------

        ocr_start = time.time()

        ocr_text = run_ocr(
            image
        )

        ocr_end = time.time()

        print(
            f"OCR TOOK: {ocr_end - ocr_start:.2f} seconds"
        )

        # ----------------------------------------------------
        # No OCR result
        # ----------------------------------------------------

        if not ocr_text.strip():

            empty_fields = extract_fields(
                ""
            )

            empty_fields[
                "dates_detected"
            ] = {
                "value": [],
                "confidence": 0,
            }

            return {

                "extracted_text": "",

                "fields": empty_fields,

                "compliance": {

                    "summary": {

                        "status":
                            "NEEDS REVIEW",

                        "evaluated_fields":
                            0,

                        "total_checks":
                            7,

                        "verification_coverage":
                            0,

                        "evaluation_score":
                            0,

                        "passed":
                            0,

                        "needs_review":
                            0,

                        "not_detected":
                            7,

                        "failed":
                            0,
                    },

                    "checks": [],
                },
            }

        # ----------------------------------------------------
        # OCR DEBUG
        # ----------------------------------------------------

        print(
            "\n========== OCR TEXT ==========\n"
        )

        print(
            ocr_text[:10000]
        )

        print(
            "\n==============================\n"
        )

        # ----------------------------------------------------
        # Extract fields
        # ----------------------------------------------------

        fields = extract_fields(
            ocr_text
        )

        fields[
            "dates_detected"
        ] = extract_dates(
            ocr_text
        )

        print(
            "EXTRACTED FIELDS:",
            fields,
        )

        # ----------------------------------------------------
        # Compliance
        # ----------------------------------------------------

        compliance = (
            run_compliance_check(
                fields,
                ocr_text,
            )
        )

        # ----------------------------------------------------
        # Final response
        # ----------------------------------------------------

        response = {

            "extracted_text":
                ocr_text,

            "fields":
                fields,

            "compliance":
                compliance,
        }

        print(
            f"TOTAL REQUEST TIME: {time.time() - request_start:.2f} seconds"
        )

        print(
            "ANALYSIS COMPLETE"
        )

        return response

    except HTTPException:

        raise

    except Exception as exc:

        print(
            "UPLOAD ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Analysis failed: {str(exc)}"
            ),
        )


# ============================================================
# LOCAL DEVELOPMENT
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )