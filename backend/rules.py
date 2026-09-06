import re


# ============================================================
# PackSure - Legal Metrology Compliance Rule Engine
# ============================================================


FIELD_NAMES = {
    "license_no": "License Number",
    "marketed_by": "Marketed By",
    "mrp": "MRP",
    "net_weight": "Net Weight",
    "batch_no": "Batch Number",
    "pkd": "PKD",
    "use_by": "Use By",
}


# ============================================================
# Generic helper functions
# ============================================================

def get_confidence(field_data):
    try:
        return float(field_data.get("confidence", 0))
    except (ValueError, TypeError):
        return 0.0


def field_exists(field_data):
    return bool(field_data and field_data.get("value"))


# ============================================================
# MRP VALIDATION
# ============================================================

def validate_mrp(field_data):

    value = field_data.get("value")

    if not value:
        return {
            "field": "MRP",
            "value": None,
            "confidence": 0,
            "status": "NOT DETECTED",
            "rule": "MRP should be identifiable on the product label.",
            "reason": "MRP could not be reliably detected."
        }

    confidence = get_confidence(field_data)

    text = str(value).strip()

    # Remove common currency prefixes
    cleaned = re.sub(
        r"^(MRP\s*)?(Rs\.?|INR|₹)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    # Remove optional trailing text
    cleaned = cleaned.strip()

    # --------------------------------------------------------
    # Check numeric MRP
    # --------------------------------------------------------

    if not re.fullmatch(
        r"\d+(?:\.\d{1,2})?",
        cleaned
    ):
        return {
            "field": "MRP",
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": "MRP should contain a valid numeric monetary value.",
            "reason": (
                "MRP was detected, but its numeric format "
                "could not be verified."
            )
        }

    # --------------------------------------------------------
    # Convert to number
    # --------------------------------------------------------

    try:
        mrp_value = float(cleaned)
    except ValueError:
        return {
            "field": "MRP",
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": "MRP should contain a valid numeric monetary value.",
            "reason": "MRP could not be interpreted as a number."
        }

    # --------------------------------------------------------
    # Invalid zero / negative value
    # --------------------------------------------------------

    if mrp_value <= 0:
        return {
            "field": "MRP",
            "value": value,
            "confidence": confidence,
            "status": "FAIL",
            "rule": "MRP must be greater than zero.",
            "reason": "Detected MRP is zero or negative."
        }

    # --------------------------------------------------------
    # Low OCR confidence
    # --------------------------------------------------------

    if confidence < 0.80:
        return {
            "field": "MRP",
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": "OCR confidence below 80% requires verification.",
            "reason": "MRP was detected but requires human verification."
        }

    # --------------------------------------------------------
    # Valid MRP
    # --------------------------------------------------------

    return {
        "field": "MRP",
        "value": value,
        "confidence": confidence,
        "status": "PASS",
        "rule": "MRP contains a valid positive numeric value.",
        "reason": "MRP was detected and its format is valid."
    }


# ============================================================
# NET WEIGHT / NET CONTENT VALIDATION
# ============================================================

def validate_net_weight(field_data):

    value = field_data.get("value")

    if not value:
        return {
            "field": "Net Weight",
            "value": None,
            "confidence": 0,
            "status": "NOT DETECTED",
            "rule": (
                "Net quantity should be identifiable on "
                "the product label."
            ),
            "reason": "Net weight or quantity could not be detected."
        }

    confidence = get_confidence(field_data)

    text = str(value).strip()

    # --------------------------------------------------------
    # Valid units commonly used for packaged commodities
    # --------------------------------------------------------

    pattern = re.fullmatch(
        r"(\d+(?:\.\d+)?)\s*(g|kg|mg|ml|l|L)",
        text,
        re.IGNORECASE
    )

    if not pattern:

        return {
            "field": "Net Weight",
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": (
                "Net quantity should contain a numeric value "
                "followed by an appropriate unit."
            ),
            "reason": (
                "Net quantity was detected, but the value/unit "
                "format could not be verified."
            )
        }

    quantity = float(pattern.group(1))
    unit = pattern.group(2).lower()

    # --------------------------------------------------------
    # Quantity must be greater than zero
    # --------------------------------------------------------

    if quantity <= 0:

        return {
            "field": "Net Weight",
            "value": value,
            "confidence": confidence,
            "status": "FAIL",
            "rule": "Net quantity must be greater than zero.",
            "reason": "Detected net quantity is zero or negative."
        }

    # --------------------------------------------------------
    # Low confidence
    # --------------------------------------------------------

    if confidence < 0.80:

        return {
            "field": "Net Weight",
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": "OCR confidence below 80% requires verification.",
            "reason": (
                "Net quantity was detected but requires "
                "human verification."
            )
        }

    # --------------------------------------------------------
    # Valid net quantity
    # --------------------------------------------------------

    return {
        "field": "Net Weight",
        "value": value,
        "confidence": confidence,
        "status": "PASS",
        "rule": (
            "Net quantity contains a positive numeric value "
            "with a recognized unit."
        ),
        "reason": (
            f"Net quantity was detected as {quantity:g} {unit} "
            "with sufficient confidence."
        )
    }


# ============================================================
# Generic field validation
# ============================================================

def validate_field(field_key, field_data):

    field_name = FIELD_NAMES.get(
        field_key,
        field_key
    )

    if not field_data:
        field_data = {}

    # --------------------------------------------------------
    # Use specialized MRP validation
    # --------------------------------------------------------

    if field_key == "mrp":
        return validate_mrp(field_data)

    # --------------------------------------------------------
    # Use specialized net-weight validation
    # --------------------------------------------------------

    if field_key == "net_weight":
        return validate_net_weight(field_data)

    value = field_data.get("value")

    confidence = get_confidence(
        field_data
    )

    # --------------------------------------------------------
    # Field not detected
    # --------------------------------------------------------

    if not value:

        return {
            "field": field_name,
            "value": None,
            "confidence": 0,
            "status": "NOT DETECTED",
            "rule": (
                f"{field_name} should be identifiable "
                "from the product label."
            ),
            "reason": (
                f"{field_name} could not be reliably "
                "detected from the uploaded image."
            )
        }

    # --------------------------------------------------------
    # Low confidence
    # --------------------------------------------------------

    if confidence < 0.80:

        return {
            "field": field_name,
            "value": value,
            "confidence": confidence,
            "status": "REVIEW",
            "rule": (
                "Extracted values with OCR confidence "
                "below 80% require verification."
            ),
            "reason": (
                f"{field_name} was detected, but the "
                "extraction confidence is below the "
                "verification threshold."
            )
        }

    # --------------------------------------------------------
    # High confidence
    # --------------------------------------------------------

    return {
        "field": field_name,
        "value": value,
        "confidence": confidence,
        "status": "PASS",
        "rule": (
            f"{field_name} was successfully detected "
            "with sufficient extraction confidence."
        ),
        "reason": (
            f"{field_name} was detected with high confidence."
        )
    }


# ============================================================
# Check all required fields
# ============================================================

def check_required_fields(fields):

    checks = []

    for field_key in FIELD_NAMES:

        field_data = fields.get(
            field_key,
            {}
        )

        check = validate_field(
            field_key,
            field_data
        )

        checks.append(check)

    return checks


# ============================================================
# Calculate compliance metrics
# ============================================================

def calculate_compliance(checks):

    total = len(checks)

    passed = sum(
        1
        for check in checks
        if check["status"] == "PASS"
    )

    review = sum(
        1
        for check in checks
        if check["status"] == "REVIEW"
    )

    not_detected = sum(
        1
        for check in checks
        if check["status"] == "NOT DETECTED"
    )

    failed = sum(
        1
        for check in checks
        if check["status"] == "FAIL"
    )

    evaluated_fields = (
        passed +
        review +
        failed
    )

    # --------------------------------------------------------
    # Verification coverage
    # --------------------------------------------------------

    if total > 0:

        verification_coverage = round(
            (evaluated_fields / total) * 100
        )

    else:

        verification_coverage = 0

    # --------------------------------------------------------
    # Evaluation score
    # --------------------------------------------------------

    if evaluated_fields > 0:

        evaluation_score = round(
            (passed / evaluated_fields) * 100
        )

    else:

        evaluation_score = 0

    # --------------------------------------------------------
    # Overall status
    # --------------------------------------------------------

    if failed > 0:

        overall_status = "NON-COMPLIANT"

    elif review > 0:

        overall_status = "NEEDS REVIEW"

    elif not_detected > 0:

        overall_status = "NEEDS REVIEW"

    elif passed == total and total > 0:

        overall_status = "PRELIMINARILY COMPLIANT"

    else:

        overall_status = "INSUFFICIENT DATA"

    return {

        "status": overall_status,

        "evaluated_fields": evaluated_fields,

        "total_checks": total,

        "verification_coverage":
            verification_coverage,

        "evaluation_score":
            evaluation_score,

        "passed": passed,

        "needs_review": review,

        "not_detected": not_detected,

        "failed": failed
    }


# ============================================================
# MAIN COMPLIANCE FUNCTION
# ============================================================

def run_compliance_check(fields):

    # Step 1:
    # Check individual fields

    checks = check_required_fields(
        fields
    )

    # Step 2:
    # Calculate overall metrics

    summary = calculate_compliance(
        checks
    )

    # Step 3:
    # Return complete result

    return {
        "summary": summary,
        "checks": checks
    }