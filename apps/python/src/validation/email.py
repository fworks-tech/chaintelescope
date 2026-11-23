def is_valid_email(email):
    if not isinstance(email, str):
        return False
    return "@" in email and "." in email
