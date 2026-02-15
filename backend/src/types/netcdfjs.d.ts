declare module 'netcdfjs' {
  export class NetCDFReader {
    constructor(data: ArrayBuffer);
    
    // Properties
    header: any;
    dimensions: any[];
    variables: any[];
    
    // Methods
    getDataVariable(variableName: string): any;
    getDataVariableAsString(variableName: string): string;
    getAttribute(attributeName: string): any;
    getAttributeAsString(attributeName: string): string;
    getDimension(dimensionName: string): any;
    getVariable(variableName: string): any;
    toString(): string;
  }
  
  export default NetCDFReader;
}
