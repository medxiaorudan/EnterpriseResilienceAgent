package era.security

default allowed := false

allowed if {
  input.security_hold == false
  input.sensitive_data_operation == false
}
