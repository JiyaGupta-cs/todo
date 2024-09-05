import * as anchor from '@project-serum/anchor';
import { useEffect, useMemo, useState } from 'react';
import { TODO_PROGRAM_PUBKEY } from '../constants';
import todoIDL from '../constants/todo.json';
import toast from 'react-hot-toast';
import { SystemProgram } from '@solana/web3.js';
import { utf8 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { findProgramAddressSync } from '@project-serum/anchor/dist/cjs/utils/pubkey';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { authorFilter } from '../utils';

export function useTodo() {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const anchorWallet = useAnchorWallet();

    const [initialized, setInitialized] = useState(false);
    const [lastTodo, setLastTodo] = useState(0);
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [transactionPending, setTransactionPending] = useState(false);
    const [input, setInput] = useState("");

    const program = useMemo(() => {
        if (anchorWallet) {
            const provider = new anchor.AnchorProvider(connection, anchorWallet, anchor.AnchorProvider.defaultOptions());
            return new anchor.Program(todoIDL, TODO_PROGRAM_PUBKEY, provider);
        }
    }, [connection, anchorWallet]);

    useEffect(() => {
        const findProfileAccounts = async () => {
            if (program && publicKey && !transactionPending) {
                try {
                    setLoading(true);
                    console.log("Fetching profile account...");

                    const [profilePda, profileBump] = findProgramAddressSync([utf8.encode('USER_STATE'), publicKey.toBuffer()], program.programId);
                    const profileAccount = await program.account.userProfile.fetch(profilePda);

                    if (profileAccount) {
                        console.log("Profile account fetched:", profileAccount);
                        setLastTodo(profileAccount.lastTodo);
                        setInitialized(true);
                        if (profileAccount.todoCount > 0) {
                            const [todoPda, todoBump] = findProgramAddressSync([utf8.encode('TODO_STATE'), publicKey.toBuffer(), Uint8Array.from([lastTodo])], program.programId);
                            const todoAccounts = await program.account.toDoAccount.all([authorFilter(publicKey.toString())]);
                            console.log("Todo accounts fetched:", todoAccounts);
                            setTodos(todoAccounts);
                        }
                    } else {
                        console.log("Profile not yet initialized.");
                        setInitialized(false);
                    }
                } catch (error) {
                    console.error("Error fetching profile accounts:", error);
                    setInitialized(false);
                    setTodos([]);
                } finally {
                    setLoading(false);
                }
            }
        };

        findProfileAccounts();
    }, [publicKey, program, transactionPending]);

    const handleChange = (e) => {
        setInput(e.target.value);
    };

    const initializeUser = async () => {
        if (program && publicKey) {
            try {
                setTransactionPending(true);
                const [profilePda, profileBump] = findProgramAddressSync([utf8.encode('USER_STATE'), publicKey.toBuffer()], program.programId);
                const tx = await program.methods
                    .initializeUser()
                    .accounts({
                        authority: publicKey,
                        userProfile: profilePda,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();

                console.log("User initialized with transaction:", tx);
                setInitialized(true);
                toast.success("Successfully Initialized");
            } catch (error) {
                console.error("Error initializing user:", error);
                toast.error(error.toString());
            } finally {
                setTransactionPending(false);
            }
        }
    };

    const initializeStaticUser = () => {
        setInitialized(true);
    };

    const addTodo = async (e) => {
        e.preventDefault();
        if (program && publicKey) {
            try {
                setTransactionPending(true);
                const [profilePda, profileBump] = findProgramAddressSync([utf8.encode('USER_STATE'), publicKey.toBuffer()], program.programId);
                const [todoPda, todoBump] = findProgramAddressSync([utf8.encode('TODO_STATE'), publicKey.toBuffer(), Uint8Array.from([lastTodo])], program.programId);

                if (input) {
                    const tx = await program.methods
                        .addTodo(input)
                        .accounts({
                            userProfile: profilePda,
                            todoAccount: todoPda,
                            authority: publicKey,
                            systemProgram: SystemProgram.programId,
                        })
                        .rpc();

                    console.log("Todo added with transaction:", tx);
                    toast.success('Success');
                }
            } catch (error) {
                console.error("Error adding todo:", error);
                toast.error(error.toString());
            } finally {
                setTransactionPending(false);
            }
        }
    };

    const addStaticTodo = (e) => {
        e.preventDefault();
        if (input) {
            const newTodo = {
                account: {
                    idx: parseInt(todos[todos.length - 1]?.account.idx || '0') + 1,
                    content: input,
                    marked: false
                }
            };
            setTodos([newTodo, ...todos]);
            setInput("");
        }
    };

    const markStaticTodo = (todoID) => {
        setTodos(
            todos.map(todo => {
                if (todo.account.idx === todoID) {
                    return {
                        account: {
                            idx: todo.account.idx,
                            content: todo.account.content,
                            marked: !todo.account.marked
                        }
                    };
                }
                return todo;
            })
        );
    };

    const removeStaticTodo = (todoID) => {
        setTodos(
            todos.filter(todo => todo.account.idx !== todoID)
        );
    };

    const incompleteTodos = useMemo(() => todos.filter(todo => !todo.account.marked), [todos]);
    const completedTodos = useMemo(() => todos.filter(todo => todo.account.marked), [todos]);

    return {
        initialized,
        initializeStaticUser,
        loading,
        transactionPending,
        completedTodos,
        incompleteTodos,
        markStaticTodo,
        removeStaticTodo,
        addTodo,
        input,
        setInput,
        handleChange,
        initializeUser
    };
}
