# Javascript Type Conversion Reference

This reference shows you how rust types are mapped to javascript/typescript types in the client.

<table>
<thead>
    <tr>
        <th>Rust Type</th>
        <th>Javascript Type</th>
        <th>Example</th>
        <th>Note</th>
    </tr>
</thead>
<tbody>
    <tr>
        <td>bool</td>
        <td>bool</td>
        <td >
            <pre><code>await program
    .methods
    .init(true)
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>u64/u128/i64/i128</td>
        <td>anchor.BN</td>
        <td >
            <pre><code>await program
    .methods
    .init(new anchor.BN(99))
    .rpc();</code></pre>
        </td>
        <td>
            https://github.com/indutny/bn.js/
        </td>
    </tr>
    <tr>
        <td>u8/u16/u32/i8/i16/i32</td>
        <td>number</td>
        <td >
            <pre><code>await program
    .methods
    .init(99)
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>f32/f64</td>
        <td>number</td>
        <td >
            <pre><code>await program
    .methods
    .init(1.0)
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>Option&lt;T&gt;</td>
        <td><code>null</code> or T</td>
        <td >
            <pre><code>await program
    .methods
    .init(null)
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>Enum</td>
        <td nowrap><code>{ variantName: {} }</code></td>
        <td>
            <pre><code>// Rust
enum MyEnum { One, Two };
// JS
await program
    .methods
    .init({ one: {} })
    .rpc();
</code></pre>
<pre><code>
// Rust 
enum MyEnum { One: { val: u64 }, Two };
// JS
await program
    .methods
    .init({ one: { val: 99 } })
    .rpc();
</code></pre>
        </td>
        <td>
            No support for tuple variants
        </td>
    </tr>
    <tr>
        <td>Struct</td>
        <td nowrap><code>{ val: {} }</code></td>
        <td>
<pre><code>// Rust
struct MyStruct { val: u64 };
// JS
await program
    .methods
    .init({ val: 99 })
    .rpc();
</code></pre>
        </td>
        <td>
            No support for tuple structs
        </td>
    </tr>
    <tr>
        <td>[T; N]</td>
        <td>[ T ]</td>
        <td >
            <pre><code>await program
    .methods
    .init([1,2,3])
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>String</td>
        <td>string</td>
        <td >
            <pre><code>await program
    .methods
    .init("hello")
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
    <tr>
        <td>Vec&lt;T&gt;</td>
        <td>[ T ]</td>
        <td >
            <pre><code>await program
    .methods
    .init([1,2,3])
    .rpc();</code></pre>
        </td>
        <td></td>
    </tr>
</tbody>
</table>
