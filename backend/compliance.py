def run_compliance_check(fields, ocr_text=""):
    checks = []

    field_rules = {
        "license_no": "License Number",
        "marketed_by": "Marketed By",
        "mrp": "MRP",
        "net_weight": "Net Weight",
        "batch_no": "Batch Number",
        "pkd": "Packed Date",
        "use_by": "Use By / Expiry",
    }

    passed = 0
    needs_review = 0
    not_detected = 0
    failed = 0

    for key, label in field_rules.items():
        field = fields.get(key, {})

        value = field.get("value")
        confidence = field.get("confidence", 0)

        if value:
            if confidence >= 0.85:
                status = "PASS"
                reason = "Field detected with high OCR confidence."
                passed += 1
            else:
                status = "NEEDS REVIEW"
                reason = "Field detected but requires human verification."
                needs_review += 1
        else:
            status = "NOT DETECTED"
            reason = "Required field was not detected in the uploaded label."
            not_detected += 1

        checks.append({
            "field": label,
            "key": key,
            "status": status,
            "value": value,
            "confidence": confidence,
            "reason": reason,
        })

    total_checks = len(field_rules)
    evaluated_fields = passed + needs_review

    verification_coverage = round(
        (evaluated_fields / total_checks) * 100
    ) if total_checks else 0

    evaluation_score = round(
        ((passed + (needs_review * 0.5)) / evaluated_fields) * 100
    ) if evaluated_fields else 0

    if failed > 0:
        overall_status = "FAILED"
    elif needs_review > 0 or not_detected > 0:
        overall_status = "NEEDS REVIEW"
    else:
        overall_status = "COMPLIANT"

    return {
        "summary": {
            "status": overall_status,
            "evaluated_fields": evaluated_fields,
            "total_checks": total_checks,
            "verification_coverage": verification_coverage,
            "evaluation_score": evaluation_score,
            "passed": passed,
            "needs_review": needs_review,
            "not_detected": not_detected,
            "failed": failed,
        },
        "checks": checks,
    }