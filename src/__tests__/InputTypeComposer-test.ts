import {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';
import { schemaComposer, SchemaComposer } from '..';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { ListComposer } from '../ListComposer';
import { NonNullComposer } from '../NonNullComposer';
import { ThunkComposer } from '../ThunkComposer';
import { graphqlVersion } from '../utils/graphqlVersion';
import { dedent } from '../utils/dedent';

beforeEach(() => {
  schemaComposer.clear();
});

describe('InputTypeComposer', () => {
  let objectType: GraphQLInputObjectType;
  let itc: InputTypeComposer<any>;

  beforeEach(() => {
    objectType = new GraphQLInputObjectType({
      name: 'InputType',
      description: 'Mock type',
      fields: {
        input1: { type: GraphQLString },
        input2: { type: GraphQLString },
      },
    });
    itc = new InputTypeComposer(objectType, schemaComposer);
  });

  describe('field manipulation methods', () => {
    it('getFields()', () => {
      const fieldNames = Object.keys(itc.getFields());
      expect(fieldNames).toEqual(expect.arrayContaining(['input1', 'input2']));
    });

    it('getFieldNames()', () => {
      expect(itc.getFieldNames()).toEqual(expect.arrayContaining(['input1', 'input2']));
    });

    describe('getField()', () => {
      it('should return field config', () => {
        expect(itc.getFieldType('input1')).toBe(GraphQLString);
      });

      it('should throw error if field does not exist', () => {
        expect(() => itc.getField('inexistent')).toThrowError(/Cannot get field.*does not exist/);
      });
    });

    it('hasField()', () => {
      expect(itc.hasField('input1')).toBe(true);
      expect(itc.hasField('missing')).toBe(false);
    });

    it('setField()', () => {
      itc.setField('input3', { type: GraphQLString });
      const fieldNames = Object.keys(itc.getType().getFields());
      expect(fieldNames).toContain('input3');
    });

    describe('setFields()', () => {
      it('accept regular fields definition', () => {
        itc.setFields({
          input3: { type: GraphQLString },
          input4: { type: GraphQLString },
        });
        expect(itc.getFieldNames()).not.toEqual(expect.arrayContaining(['input1', 'input2']));
        expect(itc.getFieldNames()).toEqual(expect.arrayContaining(['input3', 'input4']));
        expect(itc.getFieldType('input3')).toBe(GraphQLString);
        expect(itc.getFieldType('input4')).toBe(GraphQLString);
      });

      it('accept shorthand fields definition', () => {
        itc.setFields({
          input3: GraphQLString,
          input4: 'String',
          input5: (sc) => {
            expect(sc).toBeInstanceOf(SchemaComposer);
            return GraphQLString;
          },
        });
        expect(itc.getFieldType('input3')).toBe(GraphQLString);
        expect(itc.getFieldType('input4')).toBe(GraphQLString);
        expect(itc.getFieldType('input5')).toBe(GraphQLString);
      });

      it('accept types as function', () => {
        const typeAsFn = (sc: SchemaComposer<any>) => {
          expect(sc).toBeInstanceOf(SchemaComposer);
          return GraphQLString;
        };
        itc.setFields({
          input3: { type: typeAsFn },
        });
        expect(itc.getField('input3').type).toBeInstanceOf(ThunkComposer);
        expect(itc.getFieldType('input3')).toBe(GraphQLString);

        // show provide unwrapped/unhoisted type for graphql
        if (graphqlVersion >= 14) {
          expect((itc.getType() as any)._fields().input3.type).toBe(GraphQLString);
        } else {
          expect((itc.getType() as any)._typeConfig.fields().input3.type).toBe(GraphQLString);
        }
      });
    });

    it('addFields()', () => {
      itc.addFields({
        input3: { type: GraphQLString },
        input4: { type: GraphQLString },
      });
      expect(itc.getFieldNames()).toEqual(
        expect.arrayContaining(['input1', 'input2', 'input3', 'input4'])
      );
    });

    it('addNestedFields()', () => {
      itc.addNestedFields({
        'fieldNested1.f1': { type: GraphQLString },
        fieldNested2: { type: '[Int]' },
        'fieldNested1.f2': 'Boolean!',
      });

      expect(itc.getFieldType('fieldNested1')).toBeInstanceOf(GraphQLInputObjectType);
      const fieldTC = itc.getFieldTC('fieldNested1') as InputTypeComposer;
      expect(fieldTC).toBeInstanceOf(InputTypeComposer);
      if (fieldTC instanceof InputTypeComposer) {
        expect(fieldTC.getTypeName()).toBe('InputTypeFieldNested1');
        expect(fieldTC.getFieldType('f1')).toBe(GraphQLString);
        expect(fieldTC.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
        expect((fieldTC.getFieldType('f2') as any).ofType).toBe(GraphQLBoolean);

        expect(itc.getFieldType('fieldNested2')).toBeInstanceOf(GraphQLList);
        expect((itc.getFieldType('fieldNested2') as any).ofType).toBe(GraphQLInt);
      }
    });

    describe('removeField()', () => {
      it('should remove one field', () => {
        itc.removeField('input1');
        expect(itc.getFieldNames()).not.toContain('input1');
        expect(itc.getFieldNames()).toContain('input2');
      });

      it('should remove list of fields', () => {
        itc.removeField(['input2', 'input3']);
        expect(itc.getFieldNames()).not.toContain('input2');
      });

      it('should remove field via dot-notation', () => {
        schemaComposer.addTypeDefs(`
          input Type {
            field1: [SubType]!
            field2: Int
            field3: Int
          }

          input SubType {
            subField1: SubSubType!
            subField2: Int
            subField3: Int
          }

          input SubSubType {
            subSubField1: Int
            subSubField2: Int
          }
        `);

        schemaComposer
          .getITC('Type')
          .removeField([
            'field1.subField1.subSubField1',
            'field1.subField1.nonexistent',
            'field1.nonexistent.nonexistent',
            'field1.subField3',
            'field2',
            '',
            '..',
          ]);

        expect(
          schemaComposer.getITC('Type').toSDL({
            deep: true,
            omitDescriptions: true,
          })
        ).toEqual(dedent`
          input Type {
            field1: [SubType]!
            field3: Int
          }

          input SubType {
            subField1: SubSubType!
            subField2: Int
          }

          input SubSubType {
            subSubField2: Int
          }

          scalar Int
        `);
      });
    });

    it('removeOtherFields()', () => {
      const cfg = {
        name: 'MyInput',
        fields: {
          input1: 'String',
          input2: 'String',
          input3: 'String',
        },
      };
      const itc1 = schemaComposer.createInputTC(cfg);
      itc1.removeOtherFields('input1');
      expect(itc1.getFieldNames()).toEqual(expect.arrayContaining(['input1']));
      expect(itc1.getFieldNames()).not.toEqual(expect.arrayContaining(['input2', 'input3']));

      const itc2 = schemaComposer.createInputTC(cfg);
      itc2.removeOtherFields(['input1', 'input2']);
      expect(itc2.getFieldNames()).toEqual(expect.arrayContaining(['input1', 'input2']));
      expect(itc2.getFieldNames()).not.toEqual(expect.arrayContaining(['input3']));
    });

    describe('reorderFields()', () => {
      it('should change fields order', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f3', 'f2', 'f1']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f2,f1');
      });

      it('should append not listed fields', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f3']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f1,f2');
      });

      it('should skip non existed fields', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f22', 'f3', 'f55', 'f1', 'f2']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f1,f2');
      });
    });

    describe('should extend field by name', () => {
      it('should extend existed fields', () => {
        itc.setField('input3', {
          type: GraphQLString,
        });
        itc.extendField('input3', {
          description: 'this is input #3',
        });
        expect(itc.getFieldConfig('input3').type).toBe(GraphQLString);
        expect(itc.getFieldConfig('input3').description).toBe('this is input #3');
        itc.extendField('input3', {
          type: 'Int',
        });
        expect(itc.getFieldConfig('input3').type).toBe(GraphQLInt);
      });

      it('should extend field extensions', () => {
        itc.setField('input3', {
          type: GraphQLString,
          extensions: { first: true },
        });
        itc.extendField('input3', {
          description: 'this is field #3',
          extensions: { second: true },
        });
        expect(itc.getFieldConfig('input3').extensions).toEqual({
          first: true,
          second: true,
        });
      });

      it('should work with fieldConfig as string', () => {
        itc.setField('field4', 'String');
        itc.extendField('field4', {
          description: 'this is field #4',
        });
        expect(itc.getFieldConfig('field4').type).toBe(GraphQLString);
        expect(itc.getFieldConfig('field4').description).toBe('this is field #4');
      });

      it('should throw error if field does not exists', () => {
        expect(() => itc.extendField('inexistent', { description: '123' })).toThrow(
          /Cannot extend field.*Field does not exist/
        );
      });
    });

    it('getFieldType()', () => {
      expect(itc.getFieldType('input1')).toBe(GraphQLString);
    });

    it('isFieldNonNull()', () => {
      itc.setField('input1', 'String');
      expect(itc.isFieldNonNull('input1')).toBe(false);
      itc.setField('input1', 'String!');
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeFieldNonNull()', () => {
      itc.makeFieldNonNull('input1');
      expect(itc.getFieldType('input1')).toBeInstanceOf(GraphQLNonNull);
      expect((itc.getFieldType('input1') as any).ofType).toBe(GraphQLString);
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeRequired()', () => {
      itc.setField('input1', 'String');
      itc.makeRequired('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeFieldNullable()', () => {
      itc.makeFieldNonNull('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
      itc.makeFieldNullable('input1');
      expect(itc.isFieldNonNull('input1')).toBe(false);
    });

    it('makeOptional()', () => {
      itc.makeRequired('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
      itc.makeOptional('input1');
      expect(itc.isFieldNonNull('input1')).toBe(false);
    });

    it('check Plural methods, wrap/unwrap from ListComposer', () => {
      itc.setFields({
        b1: { type: new GraphQLNonNull(GraphQLString) },
        b2: { type: '[String]' },
        b3: 'String!',
        b4: '[String!]!',
      });
      expect(itc.isFieldPlural('b1')).toBe(false);
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldPlural('b3')).toBe(false);
      expect(itc.isFieldPlural('b4')).toBe(true);
      expect(itc.isFieldNonNull('b1')).toBe(true);
      expect(itc.isFieldNonNull('b2')).toBe(false);
      expect(itc.isFieldNonNull('b3')).toBe(true);
      expect(itc.isFieldNonNull('b4')).toBe(true);

      itc.makeFieldPlural(['b1', 'b2', 'b3', 'inexistent']);
      expect(itc.isFieldPlural('b1')).toBe(true);
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldPlural('b3')).toBe(true);

      itc.makeFieldNonNull('b2');
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldNonNull('b2')).toBe(true);
      itc.makeFieldNonPlural(['b2', 'b4', 'inexistent']);
      expect(itc.isFieldPlural('b2')).toBe(false);
      expect(itc.isFieldNonNull('b2')).toBe(true);
      expect(itc.isFieldPlural('b4')).toBe(false);
      itc.makeFieldNullable(['b2', 'b4', 'inexistent']);
      expect(itc.isFieldNonNull('b2')).toBe(false);
      expect(itc.isFieldNonNull('b4')).toBe(false);
    });

    it('should add fields with converting types from string to object', () => {
      itc.setField('input3', { type: 'String' });
      itc.addFields({
        input4: { type: '[Int]' },
        input5: { type: 'Boolean!' },
      });

      expect(itc.getFieldType('input3')).toBe(GraphQLString);
      expect(itc.getFieldType('input4')).toBeInstanceOf(GraphQLList);
      expect((itc.getFieldType('input4') as any).ofType).toBe(GraphQLInt);
      expect(itc.getFieldType('input5')).toBeInstanceOf(GraphQLNonNull);
      expect((itc.getFieldType('input5') as any).ofType).toBe(GraphQLBoolean);
      expect(itc.getFieldTypeName('input3')).toBe('String');
      expect(itc.getFieldTypeName('input4')).toBe('[Int]');
      expect(itc.getFieldTypeName('input5')).toBe('Boolean!');
    });
  });

  describe('type manipulation methods', () => {
    it('getType()', () => {
      expect(itc.getType()).toBeInstanceOf(GraphQLInputObjectType);
      expect(itc.getType().name).toBe('InputType');
    });

    it('getTypeNonNull()', () => {
      expect(itc.getTypeNonNull()).toBeInstanceOf(NonNullComposer);
      expect(itc.getTypeNonNull().getTypeName()).toBe('InputType!');
    });

    it('getTypePlural()', () => {
      expect(itc.getTypePlural()).toBeInstanceOf(ListComposer);
      expect(itc.getTypePlural().getTypeName()).toBe('[InputType]');
    });

    it('getTypeName()', () => {
      expect(itc.getTypeName()).toBe('InputType');
    });

    it('setTypeName()', () => {
      itc.setTypeName('OtherInputType');
      expect(itc.getTypeName()).toBe('OtherInputType');
    });

    it('getDescription()', () => {
      expect(itc.getDescription()).toBe('Mock type');
    });

    it('setDescription()', () => {
      itc.setDescription('Changed description');
      expect(itc.getDescription()).toBe('Changed description');
    });

    it('check getters List, NonNull', () => {
      const UserTC = schemaComposer.createInputTC(`input UserInput { name: String }`);
      expect(UserTC.List).toBeInstanceOf(ListComposer);
      expect(UserTC.List.ofType).toBe(UserTC);
      expect(UserTC.List.getTypeName()).toBe('[UserInput]');
      expect(UserTC.NonNull).toBeInstanceOf(NonNullComposer);
      expect(UserTC.NonNull.ofType).toBe(UserTC);
      expect(UserTC.NonNull.getTypeName()).toBe('UserInput!');
      expect(UserTC.NonNull.List).toBeInstanceOf(ListComposer);
      expect(UserTC.NonNull.List.getTypeName()).toBe('[UserInput!]');
      expect(UserTC.NonNull.List.NonNull).toBeInstanceOf(NonNullComposer);
      expect(UserTC.NonNull.List.NonNull.getTypeName()).toBe('[UserInput!]!');
    });
  });

  describe('static method create()', () => {
    it('should create ITC by typeName as a string', () => {
      const itc1 = schemaComposer.createInputTC('TypeStub');
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getType()).toBeInstanceOf(GraphQLInputObjectType);
      expect(itc1.getFields()).toEqual({});
    });

    it('should create ITC by type template string', () => {
      const itc1 = schemaComposer.createInputTC(
        `
        input TestTypeTplInput {
          f1: String
          # Description for some required Int field
          f2: Int!
        }
      `
      );
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getTypeName()).toBe('TestTypeTplInput');
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect((itc1.getFieldType('f2') as any).ofType).toBe(GraphQLInt);
    });

    it('should create ITC by GraphQLObjectTypeConfig', () => {
      const itc1 = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: {
          f1: {
            type: 'String',
          },
          f2: 'Int!',
        },
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect((itc1.getFieldType('f2') as any).ofType).toBe(GraphQLInt);
    });

    it('should create ITC by ComposeObjectTypeConfig with inexistent types', () => {
      const itc1 = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: {
          f1: {
            type: 'Type1',
          },
          f2: 'Type2!',
        },
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getField('f1').type).toBeInstanceOf(ThunkComposer);
      expect(() => itc1.getFieldTC('f1').getTypeName()).toThrow(
        'Type with name "Type1" does not exists'
      );
      expect(itc1.isFieldNonNull('f1')).toBeFalsy();
      expect(itc1.getField('f2').type).toBeInstanceOf(NonNullComposer);
      expect((itc1.getField('f2').type as any).ofType).toBeInstanceOf(ThunkComposer);
      expect(itc1.getField('f2').type.getTypeName()).toEqual('Type2!');
      expect(itc1.isFieldNonNull('f2')).toBeTruthy();
    });

    it('should create ITC by GraphQLObjectTypeConfig with fields as Thunk', () => {
      const itc1 = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: () => ({
          f1: {
            type: 'String',
          },
          f2: 'Int!',
        }),
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getField('f1').type).toBeInstanceOf(ThunkComposer);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect((itc1.getFieldType('f2') as any).ofType).toBe(GraphQLInt);
    });

    it('should create ITC by GraphQLInputObjectType', () => {
      const objType = new GraphQLInputObjectType({
        name: 'TestTypeObj',
        fields: {
          f1: {
            type: GraphQLString,
          },
        },
      });
      const itc1 = schemaComposer.createInputTC(objType);
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getType()).toBe(objType);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
    });

    it('should create type and store it in schemaComposer', () => {
      const SomeUserITC = schemaComposer.createInputTC('SomeUserInput');
      expect(schemaComposer.getITC('SomeUserInput')).toBe(SomeUserITC);
    });

    it('createTemp() should not store type in schemaComposer', () => {
      InputTypeComposer.createTemp('SomeUserInput');
      expect(schemaComposer.has('SomeUserInput')).toBeFalsy();
    });
  });

  it('get() should return type by path', () => {
    const itc1 = new InputTypeComposer(
      new GraphQLInputObjectType({
        name: 'Writable',
        fields: {
          field1: {
            type: GraphQLString,
          },
        },
      }),
      schemaComposer
    );

    expect((itc1.get('field1') as any).getType()).toBe(GraphQLString);
  });

  it('should have chain methods', () => {
    const itc1 = schemaComposer.createInputTC('InputType');
    expect(itc1.setFields({})).toBe(itc1);
    expect(itc1.setField('f1', 'String')).toBe(itc1);
    expect(itc1.extendField('f1', {})).toBe(itc1);
    expect(itc1.addFields({})).toBe(itc1);
    expect(itc1.removeField('f1')).toBe(itc1);
    expect(itc1.removeOtherFields('f1')).toBe(itc1);
    expect(itc1.reorderFields(['f1'])).toBe(itc1);
    expect(itc1.makeRequired('f1')).toBe(itc1);
    expect(itc1.makeOptional('f1')).toBe(itc1);
    expect(itc1.setTypeName('InputType2')).toBe(itc1);
    expect(itc1.setDescription('Test')).toBe(itc1);
  });

  describe('getFieldTC()', () => {
    const myITC = schemaComposer.createInputTC('MyCustomInputType');
    myITC.addFields({
      scalar: 'String',
      list: '[Int]',
      obj: schemaComposer.createInputTC(`input MyInputType { name: String }`),
      objArr: [schemaComposer.createInputTC(`input MyInputType2 { name: String }`)],
      enum: schemaComposer.createEnumTC(`enum MyEnumType { FOO BAR }`),
    });

    it('should return TypeComposer for object field', () => {
      const tco = myITC.getFieldTC('obj');
      expect(tco).toBeInstanceOf(InputTypeComposer);
      expect(tco.getTypeName()).toBe('MyInputType');
    });

    it('should return TypeComposer for wrapped object field', () => {
      const tco = myITC.getFieldTC('objArr');
      expect(tco).toBeInstanceOf(InputTypeComposer);
      expect(tco.getTypeName()).toBe('MyInputType2');
      // should return the same TypeComposer instance
      const tco2 = myITC.getFieldITC('objArr');
      expect(tco).toBe(tco2);
    });

    it('should return TypeComposer for scalar fields', () => {
      const tco = myITC.getFieldTC('scalar');
      expect(tco).toBeInstanceOf(ScalarTypeComposer);
      expect(tco.getTypeName()).toBe('String');
    });

    it('should return TypeComposer for scalar list fields', () => {
      const tco = myITC.getFieldTC('list');
      expect(tco).toBeInstanceOf(ScalarTypeComposer);
      expect(tco.getTypeName()).toBe('Int');
    });

    it('should return TypeComposer for interface list fields', () => {
      const tco = myITC.getFieldTC('enum');
      expect(tco).toBeInstanceOf(EnumTypeComposer);
      expect(tco.getTypeName()).toBe('MyEnumType');
    });
  });

  describe('directive methods', () => {
    it('type level directive methods', () => {
      const tc1 = schemaComposer.createInputTC(`
        input My1 @d0(a: false) @d1(b: "3") @d0(a: true) { 
          field: Int
        }`);
      expect(tc1.getDirectives()).toEqual([
        { args: { a: false }, name: 'd0' },
        { args: { b: '3' }, name: 'd1' },
        { args: { a: true }, name: 'd0' },
      ]);
      expect(tc1.getDirectiveNames()).toEqual(['d0', 'd1', 'd0']);
      expect(tc1.getDirectiveByName('d0')).toEqual({ a: false });
      expect(tc1.getDirectiveById(0)).toEqual({ a: false });
      expect(tc1.getDirectiveByName('d1')).toEqual({ b: '3' });
      expect(tc1.getDirectiveById(1)).toEqual({ b: '3' });
      expect(tc1.getDirectiveByName('d2')).toEqual(undefined);
      expect(tc1.getDirectiveById(333)).toEqual(undefined);
    });

    it('field level directive methods', () => {
      const tc1 = schemaComposer.createInputTC(`
        input My1 { 
          field: Int @f0(a: false) @f1(b: "3") @f0(a: true)
        }`);
      expect(tc1.getFieldDirectives('field')).toEqual([
        { args: { a: false }, name: 'f0' },
        { args: { b: '3' }, name: 'f1' },
        { args: { a: true }, name: 'f0' },
      ]);
      expect(tc1.getFieldDirectiveNames('field')).toEqual(['f0', 'f1', 'f0']);
      expect(tc1.getFieldDirectiveByName('field', 'f0')).toEqual({ a: false });
      expect(tc1.getFieldDirectiveById('field', 0)).toEqual({ a: false });
      expect(tc1.getFieldDirectiveByName('field', 'f1')).toEqual({ b: '3' });
      expect(tc1.getFieldDirectiveById('field', 1)).toEqual({ b: '3' });
      expect(tc1.getFieldDirectiveByName('field', 'f2')).toEqual(undefined);
      expect(tc1.getFieldDirectiveById('field', 333)).toEqual(undefined);
    });

    it('check directive set-methods', () => {
      const tc1 = schemaComposer.createInputTC(`
        input My1 @d0(a: true) {
          field: Int @f0(a: false) @f1(b: "3") @f0(a: true)
        }
      `);
      expect(tc1.toSDL()).toBe(dedent`
        input My1 @d0(a: true) {
          field: Int @f0(a: false) @f1(b: "3") @f0(a: true)
        }
      `);
      tc1.setDirectives([
        { args: { a: false }, name: 'd0' },
        { args: { b: '3' }, name: 'd1' },
        { args: { a: true }, name: 'd0' },
      ]);
      tc1.setFieldDirectives('field', [{ args: { b: '6' }, name: 'd1' }]);
      expect(tc1.toSDL()).toBe(dedent`
        input My1 @d0(a: false) @d1(b: "3") @d0(a: true) {
          field: Int @d1(b: "6")
        }
      `);
    });

    it('should create directives via config as object', () => {
      const tc2 = schemaComposer.createInputTC({
        name: 'MyInput',
        fields: {
          red: { type: 'Int', directives: [{ name: 'skip', args: { if: true } }] },
        },
        directives: [{ name: 'ok', args: { a: 1, b: '123', c: true } }, { name: 'go' }],
      });
      expect(tc2.toSDL()).toEqual(dedent`
        input MyInput @ok(a: 1, b: "123", c: true) @go {
          red: Int @skip(if: true)
        }
      `);
    });

    it('setDirectiveByName should add directive if does not exist', () => {
      const tc2 = schemaComposer.createInputTC({
        name: 'MyInput',
        fields: {
          red: { type: 'Int', directives: [{ name: 'skip', args: { if: true } }] },
        },
        directives: [{ name: 'ok', args: { a: 1 } }],
      });
      tc2.setDirectiveByName('go');
      expect(tc2.toSDL()).toEqual(dedent`
        input MyInput @ok(a: 1) @go {
          red: Int @skip(if: true)
        }
      `);
    });

    it('setDirectiveByName should replace first directive args if exists', () => {
      const tc2 = schemaComposer.createInputTC({
        name: 'MyInput',
        fields: {
          red: { type: 'Int', directives: [{ name: 'skip', args: { if: true } }] },
        },
        directives: [{ name: 'ok', args: { a: 1 } }, { name: 'go' }],
      });
      tc2.setDirectiveByName('ok', { b: 2 });
      expect(tc2.toSDL()).toEqual(dedent`
        input MyInput @ok(b: 2) @go {
          red: Int @skip(if: true)
        }
      `);
    });

    it('setFieldDirectiveByName should add directive if does not exist', () => {
      const tc2 = schemaComposer.createInputTC({
        name: 'MyInput',
        fields: {
          red: { type: 'Int', directives: [{ name: 'ok', args: { a: 1 } }] },
        },
      });
      tc2.setFieldDirectiveByName('red', 'go');
      expect(tc2.toSDL()).toEqual(dedent`
        input MyInput {
          red: Int @ok(a: 1) @go
        }
      `);
    });

    it('setFieldDirectiveByName should replace first directive args if exists', () => {
      const tc2 = schemaComposer.createInputTC({
        name: 'MyInput',
        fields: {
          red: { type: 'Int', directives: [{ name: 'ok', args: { a: 1 } }, { name: 'go' }] },
        },
      });
      tc2.setFieldDirectiveByName('red', 'ok', { b: 2 });
      expect(tc2.toSDL()).toEqual(dedent`
        input MyInput {
          red: Int @ok(b: 2) @go
        }
      `);
    });
  });

  describe('merge()', () => {
    it('should merge with GraphQLInputObjectType', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      const filter2 = new GraphQLInputObjectType({
        name: 'Filter2',
        fields: {
          age: { type: GraphQLInt },
        },
      });
      filterITC.merge(filter2);
      expect(filterITC.getFieldNames()).toEqual(['name', 'age']);
    });

    it('should merge with InputTypeComposer', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      const sc2 = new SchemaComposer();
      const itc2 = sc2.createInputTC(`input Filter2 { age: Int }`);
      filterITC.merge(itc2);
      expect(filterITC.getFieldNames()).toEqual(['name', 'age']);
    });

    it('should throw error on wrong type', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      expect(() => filterITC.merge(schemaComposer.createScalarTC('Scalar') as any)).toThrow(
        'Cannot merge ScalarTypeComposer'
      );
    });
  });

  describe('misc methods', () => {
    it('getNestedTCs()', () => {
      const sc1 = new SchemaComposer();
      sc1.addTypeDefs(`
        input Filter { a: Int b: Filter, geo: LonLat }
        input LonLat { lon: Float lat: Float}

        input OtherInput1 { b: Int }
        union C = A | B
        type A { f1: Int }
        type B { f2: User }
      `);

      expect(
        Array.from(sc1.getITC('Filter').getNestedTCs().values()).map((t) => t.getTypeName())
      ).toEqual(['Int', 'Filter', 'LonLat', 'Float']);
    });

    it('toSDL()', () => {
      const t = schemaComposer.createInputTC(`
        """desc1"""
        input Filter { 
          """desc2"""
          name: String
        }
      `);
      expect(t.toSDL()).toEqual(dedent`
        """desc1"""
        input Filter {
          """desc2"""
          name: String
        }
      `);
    });

    it('toSDL({ deep: true })', () => {
      const sc1 = new SchemaComposer();
      sc1.addTypeDefs(`
        input Filter { a: Int b: Filter, geo: LonLat }
        input LonLat { lon: Float lat: Float}

        input OtherInput1 { b: Int }
        union C = A | B
        type A { f1: Int }
        type B { f2: User }
      `);

      expect(
        sc1.getITC('Filter').toSDL({
          deep: true,
          omitDescriptions: true,
        })
      ).toEqual(dedent`
        input Filter {
          a: Int
          b: Filter
          geo: LonLat
        }

        scalar Int

        input LonLat {
          lon: Float
          lat: Float
        }

        scalar Float
      `);

      expect(
        sc1.getITC('Filter').toSDL({
          deep: true,
          omitDescriptions: true,
          exclude: ['LonLat'],
        })
      ).toBe(dedent`
        input Filter {
          a: Int
          b: Filter
          geo: LonLat
        }

        scalar Int
      `);
    });
  });

  describe('clone()', () => {
    it('should clone type', () => {
      itc.setExtension('ext1', 123);
      itc.setFieldExtension('input1', 'ext2', 456);
      const cloned = itc.clone('ClonedInput');
      expect(cloned.getTypeName()).toEqual('ClonedInput');
      expect(itc.getType()).not.toBe(cloned.getType());

      // field config should be different
      cloned.setField('input3', 'String');
      expect(cloned.hasField('input3')).toBeTruthy();
      expect(itc.hasField('input3')).toBeFalsy();

      // extensions should be different
      expect(cloned.getExtension('ext1')).toBe(123);
      cloned.setExtension('ext1', 300);
      expect(cloned.getExtension('ext1')).toBe(300);
      expect(itc.getExtension('ext1')).toBe(123);
      expect(cloned.getFieldExtension('input1', 'ext2')).toBe(456);
      cloned.setFieldExtension('input1', 'ext2', 600);
      expect(cloned.getFieldExtension('input1', 'ext2')).toBe(600);
      expect(itc.getFieldExtension('input1', 'ext2')).toBe(456);

      expect(() => {
        itc.clone(undefined as any);
      }).toThrowError(/You should provide new type name/);
    });
  });

  describe('cloneTo()', () => {
    it('should clone type with subtypes to another Schema', () => {
      itc.setExtension('ext1', 123);
      itc.setFieldExtension('input1', 'ext2', 456);
      itc.setField('complex', `input InnerType { a: String }`);
      const sc2 = new SchemaComposer();
      const cloned = itc.cloneTo(sc2);

      expect(itc.getTypeName()).toEqual(cloned.getTypeName());
      expect(itc).not.toBe(cloned);
      expect(itc.getType()).not.toBe(cloned.getType());
      expect(itc.getField('complex')).not.toBe(cloned.getField('complex'));
      expect(itc.getFieldType('complex')).not.toBe(cloned.getFieldType('complex'));
      expect(itc.getFieldTC('complex')).not.toBe(cloned.getFieldTC('complex'));

      expect(sc2.getITC(itc.getTypeName())).not.toBe(itc);

      // field config should be different
      cloned.setField('input3', 'String');
      expect(cloned.hasField('input3')).toBeTruthy();
      expect(itc.hasField('input3')).toBeFalsy();

      // extensions should be different
      expect(cloned.getExtension('ext1')).toBe(123);
      cloned.setExtension('ext1', 300);
      expect(cloned.getExtension('ext1')).toBe(300);
      expect(itc.getExtension('ext1')).toBe(123);
      expect(cloned.getFieldExtension('input1', 'ext2')).toBe(456);
      cloned.setFieldExtension('input1', 'ext2', 600);
      expect(cloned.getFieldExtension('input1', 'ext2')).toBe(600);
      expect(itc.getFieldExtension('input1', 'ext2')).toBe(456);
    });
  });

  describe('solve hoisting problems via thunk for fieldConfig', () => {
    it('setFields() & setField() should keep fieldConfig as thunk', () => {
      const HoistingTC = schemaComposer.createInputTC('Hoisting');
      const thunkedFieldConfig = () => ({ type: 'Int' });
      HoistingTC.setFields({
        field2: thunkedFieldConfig,
        field3: 'Int',
      });
      HoistingTC.setField('field1', thunkedFieldConfig);

      expect((HoistingTC as any)._gqcFields.field1).toBe(thunkedFieldConfig);
      expect((HoistingTC as any)._gqcFields.field2).toBe(thunkedFieldConfig);
      expect((HoistingTC as any)._gqcFields.field3.type).toBeInstanceOf(ScalarTypeComposer);
    });

    it('getField() should unwrap field from thunk & convert it to ComposeFieldConfig', () => {
      const HoistingTC = schemaComposer.createInputTC('Hoisting');
      const thunkedFieldConfig = () => ({
        type: 'Int',
      });
      HoistingTC.setFields({
        field1: thunkedFieldConfig,
        field2: thunkedFieldConfig,
        field3: 'Int',
      });
      // by default fieldConfig is thunked
      expect((HoistingTC as any)._gqcFields.field1).toBe(thunkedFieldConfig);
      // getField it should be unwrapped from thunk and converted to ComposeFieldConfig
      expect(HoistingTC.getField('field1')).toEqual({
        type: expect.any(ScalarTypeComposer),
      });
      // after first getField, type should be keep unthunked
      expect((HoistingTC as any)._gqcFields.field1).toEqual({
        type: expect.any(ScalarTypeComposer),
      });
      // other thunked fields should be untouched
      expect((HoistingTC as any)._gqcFields.field2).toBe(thunkedFieldConfig);
    });
  });
});
