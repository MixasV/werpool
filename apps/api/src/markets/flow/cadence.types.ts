export type CadenceValue =
  | CadenceOptional
  | CadenceDictionary
  | CadenceArray
  | CadenceStruct
  | CadenceNumber
  | CadenceString
  | CadenceAddress;

export interface CadenceOptional {
  type: "Optional" | "OptionalValue";
  value: CadenceValue | null;
}

export interface CadenceDictionary {
  type: "Dictionary";
  value: Array<{ key: CadenceValue; value: CadenceValue }>;
}

export interface CadenceArray {
  type: "Array";
  value: CadenceValue[];
}

export interface CadenceStruct {
  type: "Struct";
  value: {
    id: string;
    fields: Array<{ name: string; value: CadenceValue }>;
  };
}

export interface CadenceNumber {
  type: "UInt64" | "Int" | "Int64" | "UFix64" | "Fix64" | "UInt";
  value: string;
}

export interface CadenceString {
  type: "String";
  value: string;
}

export interface CadenceAddress {
  type: "Address";
  value: string;
}

export interface CadenceScriptResponse {
  value: CadenceValue | null;
}
