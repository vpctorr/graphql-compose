import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';
import { NonNullComposer, schemaComposer as sc } from '../..';
import { ObjectTypeComposer } from '../../ObjectTypeComposer';
import { InputTypeComposer } from '../../InputTypeComposer';
import { InterfaceTypeComposer } from '../../InterfaceTypeComposer';
import { toInputObjectType, toInputType } from '../toInputType';

describe('toInputType()', () => {
  beforeEach(() => {
    sc.clear();
  });

  it('should return Scalar, Enum, Input types unchanged', () => {
    const stc = sc.createScalarTC('MyScalar');
    const itc1 = toInputType(stc);
    expect(itc1).toBe(stc);

    const etc = sc.createEnumTC('MyEnum');
    const itc2 = toInputType(etc);
    expect(itc2).toBe(etc);

    const itc = sc.createInputTC('MyInput');
    const itc3 = toInputType(itc);
    expect(itc3).toBe(itc);
  });

  it('should return wrapped Scalar, Enum Input types unchanged', () => {
    const stc = sc.createScalarTC('MyScalar').List.NonNull;
    const itc1 = toInputType(stc);
    expect(itc1.getTypeName()).toBe('[MyScalar]!');
    expect((itc1 as any).ofType.ofType).toBe(stc.ofType.ofType);

    const etc = sc.createEnumTC('MyEnum').NonNull;
    const itc2 = toInputType(etc);
    expect(itc2.getTypeName()).toBe('MyEnum!');
    expect((itc2 as any).ofType).toBe(etc.ofType);

    const itc = sc.createScalarTC('MyInput').NonNull.List.NonNull;
    const itc3 = toInputType(itc);
    expect(itc3.getTypeName()).toBe('[MyInput!]!');
    expect((itc3 as any).ofType.ofType.ofType).toBe(itc.ofType.ofType.ofType);
  });

  it('should convert wrapped Object type to new Input type', () => {
    const otc = sc.createObjectTC({
      name: 'MyObject',
      fields: { a: 'Int', b: 'Float!' },
    }).NonNull;
    const itc = toInputType(otc) as NonNullComposer<InputTypeComposer>;
    expect(itc.getTypeName()).toBe('MyObjectInput!');
    expect(itc.ofType.getFieldTypeName('a')).toBe('Int');
    expect(itc.ofType.getFieldTypeName('b')).toBe('Float!');
  });
});

describe('toInputObjectType()', () => {
  let PersonTC: ObjectTypeComposer<any, any>;

  beforeEach(() => {
    sc.clear();
    PersonTC = ObjectTypeComposer.create(
      {
        name: 'Person',
        fields: {
          name: 'String',
          age: { type: GraphQLInt },
          address: {
            type: new GraphQLObjectType({
              name: 'Address',
              fields: {
                city: { type: GraphQLString },
                street: { type: GraphQLString },
              },
            }),
          },
        },
      },
      sc
    );
  });

  it('should return InputTypeComposer', () => {
    const itc = toInputObjectType(PersonTC);
    expect(itc).toBeInstanceOf(InputTypeComposer);
    expect(itc.getTypeName()).toBe('PersonInput');
  });

  it('should accept prefix in opts', () => {
    const itc = toInputObjectType(PersonTC, { prefix: 'SomePrefix' });
    expect(itc.getTypeName()).toBe('SomePrefixPersonInput');
  });

  it('should accept postfix in opts', () => {
    const itc = toInputObjectType(PersonTC, { postfix: 'PostfixInput' });
    expect(itc.getTypeName()).toBe('PersonPostfixInput');
  });

  it('should keep scalar types', () => {
    const itc = toInputObjectType(PersonTC);
    expect(itc.getFieldType('name')).toBe(GraphQLString);
    expect(itc.getFieldType('age')).toBe(GraphQLInt);
  });

  it('should convert field with ObjectType to InputType', () => {
    const itc = toInputObjectType(PersonTC);
    const addrType = itc.getFieldType('address') as GraphQLInputObjectType;
    expect(addrType).toBeInstanceOf(GraphQLInputObjectType);
    expect(addrType.name).toBe('AddressInput');
  });

  it('should reuse generated input type for recursive types', () => {
    PersonTC.setField('spouse', PersonTC);
    const itc = toInputObjectType(PersonTC);
    expect(itc.getFieldType('spouse')).toBe(itc.getType());
  });

  it('should reuse generated input type for recursive types in List', () => {
    PersonTC.setField('friends', PersonTC.getTypePlural());
    const itc = toInputObjectType(PersonTC);
    expect(itc.getFieldType('friends')).toBeInstanceOf(GraphQLList);
    expect((itc.getFieldType('friends') as GraphQLList<any>).ofType).toBe(itc.getType());
  });

  it('should convert InterfaceTypeComposer to InputTypeComposer', () => {
    const iftc = InterfaceTypeComposer.create(
      `
      interface IFace {
        name: String
        age: Int
      }
    `,
      sc
    );
    const itc = toInputObjectType(iftc);
    expect(itc.getFieldType('name')).toBe(GraphQLString);
    expect(itc.getFieldType('age')).toBe(GraphQLInt);
    expect(itc.getTypeName()).toBe('IFaceInput');
  });

  it('should convert field with InterfaceType to InputType', () => {
    InterfaceTypeComposer.create(
      `
      interface IFace {
        name: String
        age: Int
      }
    `,
      sc
    );
    const tc = ObjectTypeComposer.create(
      `
      type Example implements IFace {
        name: String
        age: Int
        neighbor: IFace
      }
    `,
      sc
    );
    const itc = toInputObjectType(tc);
    expect(itc.getFieldType('name')).toBe(GraphQLString);
    expect(itc.getFieldType('age')).toBe(GraphQLInt);
    const ifaceField = itc.getFieldTC('neighbor');
    expect(ifaceField).toBeInstanceOf(InputTypeComposer);
    if (ifaceField instanceof InputTypeComposer) {
      expect(ifaceField.getType()).toBeInstanceOf(GraphQLInputObjectType);
      expect(ifaceField.getTypeName()).toBe('IFaceInput');
      expect(ifaceField.getFieldType('name')).toBe(GraphQLString);
      expect(ifaceField.getFieldType('age')).toBe(GraphQLInt);
      expect(itc.getTypeName()).toBe('ExampleInput');
    }
  });

  describe('fallbackType option', () => {
    let tc: ObjectTypeComposer<any, any>;

    beforeEach(() => {
      sc.clear();
      sc.addTypeDefs(`
        union SearchResult = Post | Comment

        type Post {
          title: String
        }

        type Comment {
          text: String
        }
      `);
      tc = ObjectTypeComposer.create(
        `
        type Example {
          name: String
          union: SearchResult
        }
      `,
        sc
      );
    });

    it('should throw error on field with Union type', () => {
      expect(() => {
        toInputObjectType(tc);
      }).toThrowError("Can not convert field 'Example.union' to InputType");
    });

    it('should use type from fallbackType option for union', () => {
      const itc = toInputObjectType(tc, { fallbackType: 'JSON' });
      expect(itc.getFieldTypeName('union')).toBe('JSON');
    });

    it('should remove union field if fallbackType: null', () => {
      const itc = toInputObjectType(tc, { fallbackType: null });
      expect(itc.hasField('union')).toBeFalsy();
    });
  });
});
