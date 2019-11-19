var Component = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                for (let j = 0; j < node.attributes.length; j += 1) {
                    const attribute = node.attributes[j];
                    if (!attributes[attribute.name])
                        node.removeAttribute(attribute.name);
                }
                return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, props) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : prop_values;
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/index.svelte generated by Svelte v3.14.1 */

    const { console: console_1 } = globals;
    const file = "src/index.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.item = list[i];
    	child_ctx.index = i;
    	return child_ctx;
    }

    // (55:6) {#each navigationItems as item, index}
    function create_each_block(ctx) {
    	let a;
    	let t0_value = ctx.item.text + "";
    	let t0;
    	let t1;
    	let a_href_value;
    	let a_class_value;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t0 = text(t0_value);
    			t1 = space();
    			this.h();
    		},
    		l: function claim(nodes) {
    			a = claim_element(nodes, "A", { href: true, class: true });
    			var a_nodes = children(a);
    			t0 = claim_text(a_nodes, t0_value);
    			t1 = claim_space(a_nodes);
    			a_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(a, "href", a_href_value = ctx.item.href);

    			attr_dev(a, "class", a_class_value = "block mt-4 lg:inline-block lg:mt-0 text-teal-200\n          hover:text-white " + (ctx.index === ctx.navigationItems.length - 1
    			? ""
    			: "mr-4"));

    			add_location(a, file, 55, 8, 1811);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t0);
    			append_dev(a, t1);
    		},
    		p: function update(changed, ctx) {
    			if (changed.navigationItems && t0_value !== (t0_value = ctx.item.text + "")) set_data_dev(t0, t0_value);

    			if (changed.navigationItems && a_href_value !== (a_href_value = ctx.item.href)) {
    				attr_dev(a, "href", a_href_value);
    			}

    			if (changed.navigationItems && a_class_value !== (a_class_value = "block mt-4 lg:inline-block lg:mt-0 text-teal-200\n          hover:text-white " + (ctx.index === ctx.navigationItems.length - 1
    			? ""
    			: "mr-4"))) {
    				attr_dev(a, "class", a_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(55:6) {#each navigationItems as item, index}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let nav;
    	let div0;
    	let svg0;
    	let path0;
    	let t0;
    	let span;
    	let t1;
    	let t2;
    	let div1;
    	let button;
    	let svg1;
    	let title;
    	let t3;
    	let path1;
    	let t4;
    	let div4;
    	let div2;
    	let t5;
    	let div3;
    	let a;
    	let t6;
    	let dispose;
    	let each_value = ctx.navigationItems;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			div0 = element("div");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			t0 = space();
    			span = element("span");
    			t1 = text("Tailwind CSS");
    			t2 = space();
    			div1 = element("div");
    			button = element("button");
    			svg1 = svg_element("svg");
    			title = svg_element("title");
    			t3 = text("Menu");
    			path1 = svg_element("path");
    			t4 = space();
    			div4 = element("div");
    			div2 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t5 = space();
    			div3 = element("div");
    			a = element("a");
    			t6 = text("Download");
    			this.h();
    		},
    		l: function claim(nodes) {
    			nav = claim_element(nodes, "NAV", { class: true });
    			var nav_nodes = children(nav);
    			div0 = claim_element(nav_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);

    			svg0 = claim_element(
    				div0_nodes,
    				"svg",
    				{
    					class: true,
    					width: true,
    					height: true,
    					viewBox: true,
    					xmlns: true
    				},
    				1
    			);

    			var svg0_nodes = children(svg0);
    			path0 = claim_element(svg0_nodes, "path", { d: true }, 1);
    			children(path0).forEach(detach_dev);
    			svg0_nodes.forEach(detach_dev);
    			t0 = claim_space(div0_nodes);
    			span = claim_element(div0_nodes, "SPAN", { class: true });
    			var span_nodes = children(span);
    			t1 = claim_text(span_nodes, "Tailwind CSS");
    			span_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			t2 = claim_space(nav_nodes);
    			div1 = claim_element(nav_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			button = claim_element(div1_nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			svg1 = claim_element(button_nodes, "svg", { class: true, viewBox: true, xmlns: true }, 1);
    			var svg1_nodes = children(svg1);
    			title = claim_element(svg1_nodes, "title", {}, 1);
    			var title_nodes = children(title);
    			t3 = claim_text(title_nodes, "Menu");
    			title_nodes.forEach(detach_dev);
    			path1 = claim_element(svg1_nodes, "path", { d: true }, 1);
    			children(path1).forEach(detach_dev);
    			svg1_nodes.forEach(detach_dev);
    			button_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			t4 = claim_space(nav_nodes);
    			div4 = claim_element(nav_nodes, "DIV", { class: true });
    			var div4_nodes = children(div4);
    			div2 = claim_element(div4_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div2_nodes);
    			}

    			div2_nodes.forEach(detach_dev);
    			t5 = claim_space(div4_nodes);
    			div3 = claim_element(div4_nodes, "DIV", {});
    			var div3_nodes = children(div3);
    			a = claim_element(div3_nodes, "A", { href: true, class: true });
    			var a_nodes = children(a);
    			t6 = claim_text(a_nodes, "Download");
    			a_nodes.forEach(detach_dev);
    			div3_nodes.forEach(detach_dev);
    			div4_nodes.forEach(detach_dev);
    			nav_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path0, "d", "M13.5 22.1c1.8-7.2 6.3-10.8 13.5-10.8 10.8 0 12.15 8.1 17.55 9.45\n        3.6.9 6.75-.45 9.45-4.05-1.8 7.2-6.3 10.8-13.5 10.8-10.8\n        0-12.15-8.1-17.55-9.45-3.6-.9-6.75.45-9.45 4.05zM0 38.3c1.8-7.2 6.3-10.8\n        13.5-10.8 10.8 0 12.15 8.1 17.55 9.45 3.6.9 6.75-.45 9.45-4.05-1.8\n        7.2-6.3 10.8-13.5 10.8-10.8 0-12.15-8.1-17.55-9.45-3.6-.9-6.75.45-9.45\n        4.05z");
    			add_location(path0, file, 26, 6, 649);
    			attr_dev(svg0, "class", "fill-current h-8 w-8 mr-2");
    			attr_dev(svg0, "width", "54");
    			attr_dev(svg0, "height", "54");
    			attr_dev(svg0, "viewBox", "0 0 54 54");
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg0, file, 20, 4, 495);
    			attr_dev(span, "class", "font-semibold text-xl tracking-tight");
    			add_location(span, file, 34, 4, 1065);
    			attr_dev(div0, "class", "flex items-center flex-shrink-0 text-white mr-6");
    			add_location(div0, file, 19, 2, 429);
    			add_location(title, file, 45, 8, 1490);
    			attr_dev(path1, "d", "M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z");
    			add_location(path1, file, 46, 8, 1518);
    			attr_dev(svg1, "class", "fill-current h-3 w-3");
    			attr_dev(svg1, "viewBox", "0 0 20 20");
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg1, file, 41, 6, 1368);
    			attr_dev(button, "class", "flex items-center px-3 py-2 border rounded text-teal-200\n      border-teal-400 hover:text-white hover:border-white");
    			add_location(button, file, 37, 4, 1181);
    			attr_dev(div1, "class", "block lg:hidden");
    			add_location(div1, file, 36, 2, 1147);
    			attr_dev(div2, "class", "text-sm lg:flex-grow");
    			add_location(div2, file, 53, 4, 1723);
    			attr_dev(a, "href", "/");
    			attr_dev(a, "class", "inline-block text-sm px-4 py-2 leading-none border rounded\n        text-white border-white hover:border-transparent hover:text-teal-500\n        hover:bg-white mt-4 lg:mt-0");
    			add_location(a, file, 64, 6, 2065);
    			add_location(div3, file, 63, 4, 2053);
    			attr_dev(div4, "class", "w-full block flex-grow lg:flex lg:items-center lg:w-auto");
    			toggle_class(div4, "hidden", !ctx.isMenuOpen);
    			add_location(div4, file, 50, 2, 1613);
    			attr_dev(nav, "class", "flex items-center justify-between flex-wrap bg-teal-500 p-6");
    			add_location(nav, file, 18, 0, 353);
    			dispose = listen_dev(button, "click", prevent_default(ctx.toggleMenu), false, false, true);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, div0);
    			append_dev(div0, svg0);
    			append_dev(svg0, path0);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    			append_dev(span, t1);
    			append_dev(nav, t2);
    			append_dev(nav, div1);
    			append_dev(div1, button);
    			append_dev(button, svg1);
    			append_dev(svg1, title);
    			append_dev(title, t3);
    			append_dev(svg1, path1);
    			append_dev(nav, t4);
    			append_dev(nav, div4);
    			append_dev(div4, div2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			append_dev(div4, t5);
    			append_dev(div4, div3);
    			append_dev(div3, a);
    			append_dev(a, t6);
    		},
    		p: function update(changed, ctx) {
    			if (changed.navigationItems) {
    				each_value = ctx.navigationItems;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (changed.isMenuOpen) {
    				toggle_class(div4, "hidden", !ctx.isMenuOpen);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    			destroy_each(each_blocks, detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { navigationItems = [
    		{ text: "Docs", href: "/" },
    		{ text: "Examples", href: "/" },
    		{ text: "Blog", href: "/" }
    	] } = $$props;

    	let isMenuOpen = false;

    	function toggleMenu() {
    		console.log("toggleMenu", isMenuOpen);
    		$$invalidate("isMenuOpen", isMenuOpen = !isMenuOpen);
    	}

    	const writable_props = ["navigationItems"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Src> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("navigationItems" in $$props) $$invalidate("navigationItems", navigationItems = $$props.navigationItems);
    	};

    	$$self.$capture_state = () => {
    		return { navigationItems, isMenuOpen };
    	};

    	$$self.$inject_state = $$props => {
    		if ("navigationItems" in $$props) $$invalidate("navigationItems", navigationItems = $$props.navigationItems);
    		if ("isMenuOpen" in $$props) $$invalidate("isMenuOpen", isMenuOpen = $$props.isMenuOpen);
    	};

    	return { navigationItems, isMenuOpen, toggleMenu };
    }

    class Src extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { navigationItems: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Src",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get navigationItems() {
    		throw new Error("<Src>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set navigationItems(value) {
    		throw new Error("<Src>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    return Src;

}());
